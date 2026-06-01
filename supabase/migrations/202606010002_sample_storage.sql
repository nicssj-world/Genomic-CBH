-- NIPT:NGS Sample Storage module.
-- Run after 202606010001_nipt_v1.sql.

create table public.nipt_storage_box_sequences (
  box_year integer primary key,
  last_value integer not null check (last_value between 1 and 9999)
);

create table public.nipt_storage_boxes (
  id uuid primary key default gen_random_uuid(),
  box_number integer not null,
  box_year integer not null,
  box_label text not null unique,
  status text not null default 'filling' check (status in ('filling', 'full', 'destroyed')),
  started_at timestamptz not null default now(),
  filled_at timestamptz,
  destroy_due_date date,
  destroyed_at timestamptz,
  destroyed_by_name text,
  destroyed_recorded_by uuid references public.nipt_users(id),
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (box_year, box_number),
  check (status = 'filling' or (filled_at is not null and destroy_due_date is not null)),
  check (status <> 'destroyed' or (destroyed_at is not null and nullif(trim(destroyed_by_name), '') is not null))
);

create unique index nipt_storage_boxes_one_filling on public.nipt_storage_boxes((status)) where status = 'filling';

create table public.nipt_storage_slots (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.nipt_storage_boxes(id) on delete cascade,
  slot_number integer not null check (slot_number between 1 and 81),
  position text not null,
  sample_id uuid unique references public.nipt_samples(id),
  stored_at timestamptz,
  stored_by uuid references public.nipt_users(id),
  unique (box_id, slot_number),
  unique (box_id, position),
  check ((sample_id is null and stored_at is null and stored_by is null) or (sample_id is not null and stored_at is not null and stored_by is not null))
);

create or replace function public.create_nipt_storage_box(p_actor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_existing uuid;
  v_year integer := extract(year from now() at time zone 'Asia/Bangkok')::integer;
  v_sequence integer;
  v_box uuid;
begin
  perform pg_advisory_xact_lock(7302026);

  select id into v_existing from public.nipt_storage_boxes where status = 'filling' limit 1;
  if v_existing is not null then return v_existing; end if;

  insert into public.nipt_storage_box_sequences(box_year, last_value)
  values (v_year, 1)
  on conflict (box_year) do update set last_value = public.nipt_storage_box_sequences.last_value + 1
  returning last_value into v_sequence;

  insert into public.nipt_storage_boxes(box_number, box_year, box_label, created_by)
  values (v_sequence, v_year, 'Box' || lpad(v_sequence::text, 3, '0') || '/' || v_year::text, p_actor)
  returning id into v_box;

  insert into public.nipt_storage_slots(box_id, slot_number, position)
  select v_box,
         slot,
         substr('ABCDEFGHI', ((slot - 1) % 9) + 1, 1) || (((slot - 1) / 9) + 1)::text
  from generate_series(1, 81) slot;

  return v_box;
end;
$$;

create or replace function public.autofill_nipt_storage(p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sample uuid;
  v_box uuid;
  v_slot uuid;
  v_occupied integer;
  v_assigned integer := 0;
  v_boxes_created integer := 0;
begin
  perform pg_advisory_xact_lock(7302026);

  loop
    select s.id into v_sample
    from public.nipt_samples s
    where not exists (
      select 1 from public.nipt_storage_slots ss where ss.sample_id = s.id
    )
    order by s.imported_at, s.id
    for update skip locked
    limit 1;

    exit when v_sample is null;

    select id into v_box from public.nipt_storage_boxes where status = 'filling' limit 1;
    if v_box is null then
      v_box := public.create_nipt_storage_box(p_actor);
      v_boxes_created := v_boxes_created + 1;
    end if;

    select id into v_slot
    from public.nipt_storage_slots
    where box_id = v_box and sample_id is null
    order by slot_number
    for update skip locked
    limit 1;

    if v_slot is null then
      raise exception 'Storage box has no empty slot';
    end if;

    update public.nipt_storage_slots
    set sample_id = v_sample, stored_at = now(), stored_by = p_actor
    where id = v_slot;
    v_assigned := v_assigned + 1;

    select count(*) into v_occupied
    from public.nipt_storage_slots
    where box_id = v_box and sample_id is not null;

    if v_occupied = 81 then
      update public.nipt_storage_boxes
      set status = 'full',
          filled_at = now(),
          destroy_due_date = ((now() at time zone 'Asia/Bangkok')::date + interval '2 years')::date,
          updated_at = now()
      where id = v_box;
      v_box := null;
    end if;
  end loop;

  return jsonb_build_object('assigned', v_assigned, 'boxes_created', v_boxes_created);
end;
$$;

create or replace function public.destroy_nipt_storage_box(p_box uuid, p_destroyed_by_name text, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_box public.nipt_storage_boxes;
  v_name text := trim(p_destroyed_by_name);
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if v_name = '' then raise exception 'Destroyer name is required'; end if;

  select * into v_box from public.nipt_storage_boxes where id = p_box for update;
  if not found then raise exception 'Storage box not found'; end if;
  if v_box.status <> 'full' then raise exception 'Only a full storage box can be destroyed'; end if;
  if v_box.destroy_due_date > v_today then raise exception 'Storage box is not due for destruction'; end if;

  update public.nipt_storage_boxes
  set status = 'destroyed',
      destroyed_at = now(),
      destroyed_by_name = v_name,
      destroyed_recorded_by = p_actor,
      updated_at = now()
  where id = p_box;
end;
$$;

alter table public.nipt_storage_box_sequences enable row level security;
alter table public.nipt_storage_boxes enable row level security;
alter table public.nipt_storage_slots enable row level security;

create policy nipt_storage_boxes_active_read on public.nipt_storage_boxes
for select using (public.current_nipt_role() is not null);

create policy nipt_storage_slots_active_read on public.nipt_storage_slots
for select using (public.current_nipt_role() is not null);

revoke all on function public.create_nipt_storage_box(uuid) from public, anon, authenticated;
revoke all on function public.autofill_nipt_storage(uuid) from public, anon, authenticated;
revoke all on function public.destroy_nipt_storage_box(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.create_nipt_storage_box(uuid) to service_role;
grant execute on function public.autofill_nipt_storage(uuid) to service_role;
grant execute on function public.destroy_nipt_storage_box(uuid, text, uuid) to service_role;
