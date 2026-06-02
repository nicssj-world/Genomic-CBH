-- NIPT:NGS laboratory stock ledger.
-- Run after 202606020001_qc_measurements.sql.

create table public.nipt_stock_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (nullif(trim(name), '') is not null),
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nipt_stock_items (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique check (nullif(trim(item_code), '') is not null),
  name text not null check (nullif(trim(name), '') is not null),
  category_id uuid not null references public.nipt_stock_categories(id),
  unit text not null check (nullif(trim(unit), '') is not null),
  minimum_stock numeric(14, 3) not null default 0 check (minimum_stock >= 0),
  track_lot boolean not null default true,
  track_expiry boolean not null default true,
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not track_expiry or track_lot)
);

create table public.nipt_stock_lots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.nipt_stock_items(id),
  lot_number text not null check (nullif(trim(lot_number), '') is not null),
  expiry_date date,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  unique (item_id, lot_number)
);

create table public.nipt_stock_movements (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.nipt_stock_lots(id),
  movement_type text not null check (movement_type in ('receive', 'issue', 'adjustment', 'reversal')),
  quantity numeric(14, 3) not null check (quantity <> 0),
  supplier_text text,
  reference_text text,
  note text,
  override_reason text,
  expired_confirmed boolean not null default false,
  source_movement_id uuid unique references public.nipt_stock_movements(id),
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  check (
    (movement_type = 'receive' and quantity > 0 and source_movement_id is null)
    or (movement_type = 'issue' and quantity < 0 and source_movement_id is null)
    or (movement_type = 'adjustment' and source_movement_id is null)
    or (movement_type = 'reversal' and source_movement_id is not null)
  )
);

create index nipt_stock_lots_item_id on public.nipt_stock_lots(item_id);
create index nipt_stock_movements_lot_id on public.nipt_stock_movements(lot_id);
create index nipt_stock_movements_created_at on public.nipt_stock_movements(created_at desc);

create or replace function public.assert_nipt_stock_actor(p_actor uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  select role into v_role
  from public.nipt_users
  where id = p_actor and is_active;

  if v_role is null then raise exception 'Active stock actor is required'; end if;
  return v_role;
end;
$$;

create or replace function public.nipt_stock_lot_balance(p_lot uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(quantity), 0)::numeric
  from public.nipt_stock_movements
  where lot_id = p_lot;
$$;

create or replace function public.receive_nipt_stock(
  p_item uuid,
  p_lot_number text,
  p_expiry_date date,
  p_quantity numeric,
  p_supplier_text text,
  p_reference_text text,
  p_note text,
  p_actor uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_item public.nipt_stock_items;
  v_lot public.nipt_stock_lots;
  v_lot_number text := trim(coalesce(p_lot_number, ''));
  v_expiry_date date := p_expiry_date;
  v_movement uuid;
begin
  perform public.assert_nipt_stock_actor(p_actor);
  if p_quantity is null or p_quantity <= 0 then raise exception 'Receive quantity must be greater than zero'; end if;

  select * into v_item from public.nipt_stock_items where id = p_item and is_active for update;
  if not found then raise exception 'Active stock item not found'; end if;

  if v_item.track_lot then
    if v_lot_number = '' then raise exception 'Lot number is required for this item'; end if;
  else
    v_lot_number := 'ไม่ระบุ Lot';
    v_expiry_date := null;
  end if;

  if v_item.track_expiry and v_expiry_date is null then raise exception 'Expiry date is required for this item'; end if;
  if not v_item.track_expiry then v_expiry_date := null; end if;

  select * into v_lot
  from public.nipt_stock_lots
  where item_id = p_item and lot_number = v_lot_number
  for update;

  if found then
    if v_lot.expiry_date is distinct from v_expiry_date then
      raise exception 'Existing lot expiry date does not match';
    end if;
  else
    insert into public.nipt_stock_lots(item_id, lot_number, expiry_date, created_by)
    values (p_item, v_lot_number, v_expiry_date, p_actor)
    returning * into v_lot;
  end if;

  insert into public.nipt_stock_movements(
    lot_id, movement_type, quantity, supplier_text, reference_text, note, created_by
  )
  values (
    v_lot.id, 'receive', p_quantity, nullif(trim(coalesce(p_supplier_text, '')), ''),
    nullif(trim(coalesce(p_reference_text, '')), ''), nullif(trim(coalesce(p_note, '')), ''), p_actor
  )
  returning id into v_movement;

  return v_movement;
end;
$$;

create or replace function public.issue_nipt_stock(
  p_lot uuid,
  p_quantity numeric,
  p_reference_text text,
  p_note text,
  p_override_reason text,
  p_expired_confirmed boolean,
  p_actor uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lot public.nipt_stock_lots;
  v_item public.nipt_stock_items;
  v_recommended uuid;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_movement uuid;
begin
  perform public.assert_nipt_stock_actor(p_actor);
  if p_quantity is null or p_quantity <= 0 then raise exception 'Issue quantity must be greater than zero'; end if;

  select * into v_lot from public.nipt_stock_lots where id = p_lot for update;
  if not found then raise exception 'Stock lot not found'; end if;
  select * into v_item from public.nipt_stock_items where id = v_lot.item_id;
  if not found or not v_item.is_active then raise exception 'Active stock item not found'; end if;

  if public.nipt_stock_lot_balance(v_lot.id) < p_quantity then raise exception 'Insufficient stock balance'; end if;
  if v_lot.expiry_date < v_today and not coalesce(p_expired_confirmed, false) then
    raise exception 'Confirm expired lot before issuing stock';
  end if;

  select lot.id into v_recommended
  from public.nipt_stock_lots lot
  where lot.item_id = v_lot.item_id
    and public.nipt_stock_lot_balance(lot.id) > 0
    and (lot.expiry_date is null or lot.expiry_date >= v_today)
  order by lot.expiry_date asc nulls last, lot.created_at, lot.id
  limit 1;

  if v_recommended is not null
    and v_recommended <> v_lot.id
    and nullif(trim(coalesce(p_override_reason, '')), '') is null
  then
    raise exception 'Override reason is required when not using the suggested FEFO lot';
  end if;

  insert into public.nipt_stock_movements(
    lot_id, movement_type, quantity, reference_text, note, override_reason, expired_confirmed, created_by
  )
  values (
    v_lot.id, 'issue', -p_quantity, nullif(trim(coalesce(p_reference_text, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''), nullif(trim(coalesce(p_override_reason, '')), ''),
    coalesce(p_expired_confirmed, false), p_actor
  )
  returning id into v_movement;

  return v_movement;
end;
$$;

create or replace function public.adjust_nipt_stock(
  p_lot uuid,
  p_quantity numeric,
  p_reference_text text,
  p_note text,
  p_actor uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_lot public.nipt_stock_lots;
  v_movement uuid;
begin
  v_role := public.assert_nipt_stock_actor(p_actor);
  if v_role <> 'Admin' then raise exception 'Admin permission required for stock adjustment'; end if;
  if p_quantity is null or p_quantity = 0 then raise exception 'Adjustment quantity must not be zero'; end if;
  if nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'Adjustment reason is required'; end if;

  select * into v_lot from public.nipt_stock_lots where id = p_lot for update;
  if not found then raise exception 'Stock lot not found'; end if;
  if public.nipt_stock_lot_balance(v_lot.id) + p_quantity < 0 then raise exception 'Stock balance cannot be negative'; end if;

  insert into public.nipt_stock_movements(lot_id, movement_type, quantity, reference_text, note, created_by)
  values (
    v_lot.id, 'adjustment', p_quantity, nullif(trim(coalesce(p_reference_text, '')), ''),
    trim(p_note), p_actor
  )
  returning id into v_movement;

  return v_movement;
end;
$$;

create or replace function public.reverse_nipt_stock_movement(
  p_movement uuid,
  p_reason text,
  p_actor uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_source public.nipt_stock_movements;
  v_lot public.nipt_stock_lots;
  v_movement uuid;
begin
  v_role := public.assert_nipt_stock_actor(p_actor);
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Reversal reason is required'; end if;

  select * into v_source from public.nipt_stock_movements where id = p_movement for update;
  if not found then raise exception 'Stock movement not found'; end if;
  if v_role <> 'Admin' and v_source.created_by <> p_actor then raise exception 'You can reverse only your own stock movement'; end if;
  if exists (select 1 from public.nipt_stock_movements where source_movement_id = v_source.id) then
    raise exception 'Stock movement is already reversed';
  end if;

  select * into v_lot from public.nipt_stock_lots where id = v_source.lot_id for update;
  if public.nipt_stock_lot_balance(v_lot.id) - v_source.quantity < 0 then raise exception 'Stock balance cannot be negative'; end if;

  insert into public.nipt_stock_movements(lot_id, movement_type, quantity, note, source_movement_id, created_by)
  values (v_source.lot_id, 'reversal', -v_source.quantity, trim(p_reason), v_source.id, p_actor)
  returning id into v_movement;

  return v_movement;
end;
$$;

create or replace function public.prevent_nipt_stock_movement_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Stock movement ledger is append-only; create a reversal instead';
end;
$$;

create trigger nipt_stock_movements_append_only
before update or delete on public.nipt_stock_movements
for each row execute function public.prevent_nipt_stock_movement_mutation();

alter table public.nipt_stock_categories enable row level security;
alter table public.nipt_stock_items enable row level security;
alter table public.nipt_stock_lots enable row level security;
alter table public.nipt_stock_movements enable row level security;

create policy nipt_stock_categories_active_read on public.nipt_stock_categories
for select using (public.current_nipt_role() is not null);

create policy nipt_stock_items_active_read on public.nipt_stock_items
for select using (public.current_nipt_role() is not null);

create policy nipt_stock_lots_active_read on public.nipt_stock_lots
for select using (public.current_nipt_role() is not null);

create policy nipt_stock_movements_active_read on public.nipt_stock_movements
for select using (public.current_nipt_role() is not null);

revoke all on function public.assert_nipt_stock_actor(uuid) from public, anon, authenticated;
revoke all on function public.nipt_stock_lot_balance(uuid) from public, anon, authenticated;
revoke all on function public.receive_nipt_stock(uuid, text, date, numeric, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.issue_nipt_stock(uuid, numeric, text, text, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.adjust_nipt_stock(uuid, numeric, text, text, uuid) from public, anon, authenticated;
revoke all on function public.reverse_nipt_stock_movement(uuid, text, uuid) from public, anon, authenticated;

grant execute on function public.assert_nipt_stock_actor(uuid) to service_role;
grant execute on function public.nipt_stock_lot_balance(uuid) to service_role;
grant execute on function public.receive_nipt_stock(uuid, text, date, numeric, text, text, text, uuid) to service_role;
grant execute on function public.issue_nipt_stock(uuid, numeric, text, text, text, boolean, uuid) to service_role;
grant execute on function public.adjust_nipt_stock(uuid, numeric, text, text, uuid) to service_role;
grant execute on function public.reverse_nipt_stock_movement(uuid, text, uuid) to service_role;
