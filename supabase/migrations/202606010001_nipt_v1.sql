-- NIPT:NGS standalone V1 schema.
-- Run against the dedicated NIPT Supabase project only.

create extension if not exists pgcrypto;

create table public.nipt_users (
  id uuid primary key references auth.users(id) on delete cascade,
  ephis_id text not null unique check (ephis_id ~ '^[0-9]+$'),
  display_name text not null,
  role text not null check (role in ('Admin', 'CBH-Staff')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nipt_daily_sequences (
  sequence_date date primary key,
  last_value integer not null check (last_value between 1 and 999)
);

create table public.nipt_samples (
  id uuid primary key default gen_random_uuid(),
  ln text not null unique,
  ln_halos text not null unique,
  imported_at timestamptz not null default now(),
  imported_by uuid not null references public.nipt_users(id),
  ga_weeks integer check (ga_weeks between 0 and 50),
  ga_days integer check (ga_days between 0 and 6),
  patient_name text,
  id_passport text,
  hn text,
  dob date,
  doctor text,
  collection_date timestamptz,
  received_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nipt_sample_runs (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references public.nipt_samples(id) on delete cascade,
  run_type text not null check (run_type in ('Normal', 'Re-Library', 'Re-Sampling')),
  stage text not null default 'Received' check (stage in ('Received', 'Extract', 'Pooling', 'Sequencing', 'Completed')),
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sample_id, run_type)
);

create unique index nipt_sample_runs_one_active on public.nipt_sample_runs(sample_id) where is_active;

create table public.nipt_batch_sequences (
  run_year integer primary key,
  last_value integer not null check (last_value between 1 and 9999)
);

create table public.nipt_batches (
  id uuid primary key default gen_random_uuid(),
  run_number integer not null,
  run_year integer not null,
  run_label text not null,
  status text not null default 'assembling' check (status in ('assembling', 'extract', 'pooling', 'sequencing', 'completed')),
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_year, run_number),
  unique (run_label)
);

create unique index nipt_batches_one_assembling on public.nipt_batches((status)) where status = 'assembling';

create table public.nipt_task_sheets (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.nipt_batches(id) on delete cascade,
  sheet_number integer not null check (sheet_number between 1 and 3),
  work_date date,
  operator_text text,
  plasma_handler text,
  extraction_lot text,
  extraction_expiry date,
  library_lot text,
  library_expiry date,
  finalized_at timestamptz,
  finalized_by uuid references public.nipt_users(id),
  revision_number integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, sheet_number)
);

create table public.nipt_batch_slots (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.nipt_batches(id) on delete cascade,
  slot_number integer not null check (slot_number between 1 and 48),
  plate_position text not null,
  sheet_number integer not null check (sheet_number between 1 and 3),
  control_type text check (control_type in ('positive', 'negative', 'blank')),
  sample_run_id uuid references public.nipt_sample_runs(id),
  assigned_at timestamptz,
  assigned_by uuid references public.nipt_users(id),
  unique (batch_id, slot_number)
);

create unique index nipt_batch_slots_one_run on public.nipt_batch_slots(sample_run_id) where sample_run_id is not null;

create table public.nipt_his_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_size bigint not null,
  mime_type text not null,
  storage_key text not null unique,
  status text not null default 'awaiting_mapping' check (status in ('awaiting_mapping', 'parsed', 'failed')),
  uploaded_by uuid not null references public.nipt_users(id),
  uploaded_at timestamptz not null default now()
);

create table public.nipt_result_revisions (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references public.nipt_samples(id) on delete cascade,
  revision_number integer not null,
  file_name text not null,
  file_size bigint not null,
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  storage_key text not null unique,
  is_active boolean not null default true,
  uploaded_by uuid not null references public.nipt_users(id),
  uploaded_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.nipt_users(id),
  void_reason text,
  unique (sample_id, revision_number)
);

create unique index nipt_result_revisions_one_active on public.nipt_result_revisions(sample_id) where is_active;

create table public.nipt_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.nipt_users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.current_nipt_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.nipt_users where id = auth.uid() and is_active;
$$;

create or replace function public.register_nipt_sample(p_ln text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ln text := trim(p_ln);
  v_existing public.nipt_samples;
  v_date date := (now() at time zone 'Asia/Bangkok')::date;
  v_sequence integer;
  v_halos text;
  v_sample public.nipt_samples;
begin
  if v_ln = '' then raise exception 'LN is required'; end if;
  select * into v_existing from public.nipt_samples where ln = v_ln;
  if found then
    return jsonb_build_object('duplicate', true, 'sample_id', v_existing.id, 'ln_halos', v_existing.ln_halos);
  end if;

  insert into public.nipt_daily_sequences(sequence_date, last_value)
  values (v_date, 1)
  on conflict (sequence_date) do update set last_value = public.nipt_daily_sequences.last_value + 1
  returning last_value into v_sequence;

  if v_sequence > 999 then raise exception 'Daily LN Halos sequence exceeded 999'; end if;
  v_halos := to_char(v_date, 'YY') || 'B' || to_char(v_date, 'YYMMDD') || lpad(v_sequence::text, 3, '0');

  begin
    insert into public.nipt_samples(ln, ln_halos, imported_by)
    values (v_ln, v_halos, p_actor)
    returning * into v_sample;
  exception when unique_violation then
    select * into v_existing from public.nipt_samples where ln = v_ln;
    if found then
      return jsonb_build_object('duplicate', true, 'sample_id', v_existing.id, 'ln_halos', v_existing.ln_halos);
    end if;
    raise;
  end;

  insert into public.nipt_sample_runs(sample_id, run_type, stage, created_by)
  values (v_sample.id, 'Normal', 'Received', p_actor);

  insert into public.nipt_audit_logs(actor_id, action, entity_type, entity_id, detail)
  values (p_actor, 'sample.register', 'sample', v_sample.id::text, jsonb_build_object('ln', v_ln, 'ln_halos', v_halos));

  return jsonb_build_object('duplicate', false, 'sample_id', v_sample.id, 'ln_halos', v_halos);
end;
$$;

create or replace function public.create_nipt_batch(p_actor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_existing uuid;
  v_year integer := extract(year from now() at time zone 'Asia/Bangkok')::integer;
  v_sequence integer;
  v_batch uuid;
begin
  select id into v_existing from public.nipt_batches where status = 'assembling' limit 1;
  if v_existing is not null then return v_existing; end if;

  insert into public.nipt_batch_sequences(run_year, last_value)
  values (v_year, 1)
  on conflict (run_year) do update set last_value = public.nipt_batch_sequences.last_value + 1
  returning last_value into v_sequence;

  insert into public.nipt_batches(run_number, run_year, run_label, created_by)
  values (v_sequence, v_year, 'Run' || lpad(v_sequence::text, 3, '0') || '/' || v_year::text, p_actor)
  returning id into v_batch;

  insert into public.nipt_task_sheets(batch_id, sheet_number)
  select v_batch, generate_series(1, 3);

  insert into public.nipt_batch_slots(batch_id, slot_number, plate_position, sheet_number, control_type)
  select v_batch,
         slot,
         substr('ABCDEFGH', ((slot - 1) % 8) + 1, 1) || (((slot - 1) / 8) + 1)::text,
         case when slot <= 16 then 1 when slot <= 32 then 2 else 3 end,
         case slot when 1 then 'positive' when 25 then 'negative' when 40 then 'blank' else null end
  from generate_series(1, 48) slot;

  insert into public.nipt_audit_logs(actor_id, action, entity_type, entity_id)
  values (p_actor, 'batch.create', 'batch', v_batch::text);
  return v_batch;
end;
$$;

create or replace function public.autofill_nipt_sheet(p_batch uuid, p_sheet integer, p_actor uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_finalized timestamptz;
  v_slot record;
  v_run uuid;
  v_count integer := 0;
begin
  select finalized_at into v_finalized from public.nipt_task_sheets where batch_id = p_batch and sheet_number = p_sheet;
  if v_finalized is not null then raise exception 'Task List is finalized'; end if;

  for v_slot in
    select id from public.nipt_batch_slots
    where batch_id = p_batch and sheet_number = p_sheet and control_type is null and sample_run_id is null
    order by slot_number
  loop
    select r.id into v_run
    from public.nipt_sample_runs r
    join public.nipt_samples s on s.id = r.sample_id
    where r.is_active and r.stage = 'Received' and not exists (
      select 1 from public.nipt_batch_slots bs where bs.sample_run_id = r.id
    )
    order by s.imported_at, r.created_at
    limit 1;
    exit when v_run is null;
    update public.nipt_batch_slots set sample_run_id = v_run, assigned_at = now(), assigned_by = p_actor where id = v_slot.id;
    update public.nipt_sample_runs set stage = 'Extract', updated_at = now() where id = v_run;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.assign_nipt_urgent(p_batch uuid, p_sheet integer, p_run uuid, p_actor uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_slot integer;
  v_finalized timestamptz;
begin
  select finalized_at into v_finalized from public.nipt_task_sheets where batch_id = p_batch and sheet_number = p_sheet;
  if v_finalized is not null then raise exception 'Task List is finalized'; end if;
  if not exists (select 1 from public.nipt_sample_runs where id = p_run and is_active and stage = 'Received') then
    raise exception 'Sample run is not available for extraction';
  end if;
  if exists (select 1 from public.nipt_batch_slots where sample_run_id = p_run) then raise exception 'Sample run is already assigned'; end if;
  select slot_number into v_slot from public.nipt_batch_slots
    where batch_id = p_batch and sheet_number = p_sheet and control_type is null and sample_run_id is null
    order by slot_number limit 1;
  if v_slot is null then raise exception 'Task List has no empty patient slot'; end if;
  update public.nipt_batch_slots set sample_run_id = p_run, assigned_at = now(), assigned_by = p_actor
    where batch_id = p_batch and slot_number = v_slot;
  update public.nipt_sample_runs set stage = 'Extract', updated_at = now() where id = p_run;
  return v_slot;
end;
$$;

create or replace function public.prevent_finalized_slot_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (
    select 1
    from public.nipt_task_sheets
    where batch_id = old.batch_id
      and sheet_number = old.sheet_number
      and finalized_at is not null
  ) then
    raise exception 'Task List is finalized';
  end if;
  return new;
end;
$$;

create trigger nipt_batch_slots_lock_finalized
before update or delete on public.nipt_batch_slots
for each row execute function public.prevent_finalized_slot_change();

alter table public.nipt_users enable row level security;
alter table public.nipt_daily_sequences enable row level security;
alter table public.nipt_samples enable row level security;
alter table public.nipt_sample_runs enable row level security;
alter table public.nipt_batch_sequences enable row level security;
alter table public.nipt_batches enable row level security;
alter table public.nipt_task_sheets enable row level security;
alter table public.nipt_batch_slots enable row level security;
alter table public.nipt_his_import_batches enable row level security;
alter table public.nipt_result_revisions enable row level security;
alter table public.nipt_audit_logs enable row level security;

create policy nipt_users_self_read on public.nipt_users for select using (id = auth.uid());
create policy nipt_samples_active_read on public.nipt_samples for select using (public.current_nipt_role() is not null);
create policy nipt_sample_runs_active_read on public.nipt_sample_runs for select using (public.current_nipt_role() is not null);
create policy nipt_batches_active_read on public.nipt_batches for select using (public.current_nipt_role() is not null);
create policy nipt_task_sheets_active_read on public.nipt_task_sheets for select using (public.current_nipt_role() is not null);
create policy nipt_batch_slots_active_read on public.nipt_batch_slots for select using (public.current_nipt_role() is not null);
create policy nipt_his_imports_active_read on public.nipt_his_import_batches for select using (public.current_nipt_role() is not null);
create policy nipt_results_active_read on public.nipt_result_revisions for select using (public.current_nipt_role() is not null);
create policy nipt_audit_admin_read on public.nipt_audit_logs for select using (public.current_nipt_role() = 'Admin');

revoke all on function public.register_nipt_sample(text, uuid) from public, anon, authenticated;
revoke all on function public.create_nipt_batch(uuid) from public, anon, authenticated;
revoke all on function public.autofill_nipt_sheet(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.assign_nipt_urgent(uuid, integer, uuid, uuid) from public, anon, authenticated;
grant execute on function public.register_nipt_sample(text, uuid) to service_role;
grant execute on function public.create_nipt_batch(uuid) to service_role;
grant execute on function public.autofill_nipt_sheet(uuid, integer, uuid) to service_role;
grant execute on function public.assign_nipt_urgent(uuid, integer, uuid, uuid) to service_role;
