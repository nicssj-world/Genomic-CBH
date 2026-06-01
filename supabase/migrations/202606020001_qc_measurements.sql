-- NIPT:NGS QC Measurements module.
-- Run after 202606010002_sample_storage.sql.

create table public.nipt_qc_sheets (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null unique references public.nipt_batches(id) on delete cascade,
  work_date date,
  operator_text text,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nipt_qc_measurements (
  id uuid primary key default gen_random_uuid(),
  qc_sheet_id uuid not null references public.nipt_qc_sheets(id) on delete cascade,
  batch_slot_id uuid not null references public.nipt_batch_slots(id) on delete cascade,
  slot_number integer not null check (slot_number between 1 and 48),
  concentration numeric(12, 4) check (concentration >= 0),
  updated_by uuid references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (qc_sheet_id, slot_number),
  unique (qc_sheet_id, batch_slot_id)
);

create table public.nipt_qc_import_batches (
  id uuid primary key default gen_random_uuid(),
  qc_sheet_id uuid not null references public.nipt_qc_sheets(id) on delete cascade,
  file_name text not null,
  file_size bigint not null,
  mime_type text not null,
  storage_key text not null unique,
  status text not null default 'awaiting_mapping' check (status in ('awaiting_mapping', 'parsed', 'failed')),
  uploaded_by uuid not null references public.nipt_users(id),
  uploaded_at timestamptz not null default now()
);

create or replace function public.ensure_nipt_qc_sheet(p_batch uuid, p_actor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_qc_sheet uuid;
  v_work_date date;
  v_operator_text text;
begin
  if exists (
    select 1 from public.nipt_task_sheets
    where batch_id = p_batch and finalized_at is null
  ) then
    raise exception 'Finalize all three Task Lists before starting QC measurements';
  end if;

  if (select count(*) from public.nipt_task_sheets where batch_id = p_batch) <> 3 then
    raise exception 'QC measurements require three Task Lists';
  end if;

  if (select count(*) from public.nipt_batch_slots where batch_id = p_batch) <> 48 then
    raise exception 'QC measurements require 48 plate slots';
  end if;

  if exists (
    select 1 from public.nipt_batch_slots
    where batch_id = p_batch and control_type is null and sample_run_id is null
  ) then
    raise exception 'Fill all 48 plate slots before starting QC measurements';
  end if;

  select work_date, operator_text
  into v_work_date, v_operator_text
  from public.nipt_task_sheets
  where batch_id = p_batch and sheet_number = 3;

  insert into public.nipt_qc_sheets(batch_id, work_date, operator_text, created_by)
  values (p_batch, v_work_date, v_operator_text, p_actor)
  on conflict (batch_id) do update set batch_id = excluded.batch_id
  returning id into v_qc_sheet;

  insert into public.nipt_qc_measurements(qc_sheet_id, batch_slot_id, slot_number)
  select v_qc_sheet, id, slot_number
  from public.nipt_batch_slots
  where batch_id = p_batch
  order by slot_number
  on conflict (qc_sheet_id, slot_number) do nothing;

  return v_qc_sheet;
end;
$$;

create or replace function public.create_nipt_qc_sheet_after_task_finalize()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.finalized_at is not null and not exists (
    select 1 from public.nipt_task_sheets
    where batch_id = new.batch_id and finalized_at is null
  ) then
    perform public.ensure_nipt_qc_sheet(new.batch_id, new.finalized_by);
  end if;
  return new;
end;
$$;

create trigger nipt_qc_sheet_after_task_finalize
after update of finalized_at on public.nipt_task_sheets
for each row execute function public.create_nipt_qc_sheet_after_task_finalize();

-- Backfill QC sheets for batches completed before this migration was installed.
select public.ensure_nipt_qc_sheet(b.id, b.created_by)
from public.nipt_batches b
where (select count(*) from public.nipt_task_sheets ts where ts.batch_id = b.id) = 3
  and not exists (
    select 1 from public.nipt_task_sheets ts
    where ts.batch_id = b.id and ts.finalized_at is null
  )
  and not exists (
    select 1 from public.nipt_batch_slots bs
    where bs.batch_id = b.id and bs.control_type is null and bs.sample_run_id is null
  );

alter table public.nipt_qc_sheets enable row level security;
alter table public.nipt_qc_measurements enable row level security;
alter table public.nipt_qc_import_batches enable row level security;

create policy nipt_qc_sheets_active_read on public.nipt_qc_sheets
for select using (public.current_nipt_role() is not null);

create policy nipt_qc_measurements_active_read on public.nipt_qc_measurements
for select using (public.current_nipt_role() is not null);

create policy nipt_qc_imports_active_read on public.nipt_qc_import_batches
for select using (public.current_nipt_role() is not null);

revoke all on function public.ensure_nipt_qc_sheet(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ensure_nipt_qc_sheet(uuid, uuid) to service_role;
