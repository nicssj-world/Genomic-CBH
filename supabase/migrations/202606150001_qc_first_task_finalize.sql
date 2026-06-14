-- Make QC measurements available as soon as the FIRST Task List in a batch is
-- finalized, instead of requiring all three Task Lists filled and finalized.
-- The QC sheet stays one-per-batch with 48 measurement rows; rows for Task Lists
-- that are not finalized yet simply stay blank until those sheets are done.

create or replace function public.ensure_nipt_qc_sheet(p_batch uuid, p_actor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_qc_sheet uuid;
  v_work_date date;
  v_operator_text text;
begin
  if not exists (
    select 1 from public.nipt_task_sheets
    where batch_id = p_batch and finalized_at is not null
  ) then
    raise exception 'Finalize at least one Task List before starting QC measurements';
  end if;

  -- Seed the QC sheet metadata from the first finalized Task List.
  select work_date, operator_text
  into v_work_date, v_operator_text
  from public.nipt_task_sheets
  where batch_id = p_batch and finalized_at is not null
  order by sheet_number
  limit 1;

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
  if new.finalized_at is not null then
    perform public.ensure_nipt_qc_sheet(new.batch_id, new.finalized_by);
  end if;
  return new;
end;
$$;

revoke all on function public.ensure_nipt_qc_sheet(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ensure_nipt_qc_sheet(uuid, uuid) to service_role;
