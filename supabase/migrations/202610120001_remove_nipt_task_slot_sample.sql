-- Admin-only atomic removal of a sample from an unfinalized extraction Task List.
-- Does not delete a patient sample. The sample can be deleted separately from Patient Registry.
create or replace function public.remove_nipt_task_slot_sample(
  p_batch uuid,
  p_slot uuid,
  p_run uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_status text;
  v_sheet integer;
  v_finalized timestamptz;
  v_control text;
  v_assigned_run uuid;
  v_stage text;
  v_active boolean;
  v_sample_id uuid;
  v_ln text;
  v_halos text;
  v_slot_number integer;
begin
  if not exists (
    select 1 from public.nipt_users
    where id = p_actor and is_active = true and role = 'Admin'
  ) then
    raise exception 'Admin permission required';
  end if;

  -- Serialize with batch changes, sheet finalization and other edits.
  select status into v_batch_status
  from public.nipt_batches where id = p_batch for update;
  if not found then raise exception 'Batch not found'; end if;
  if v_batch_status <> 'assembling' then
    raise exception 'ลบไม่ได้: Batch นี้เริ่มขั้นตอน Extraction แล้ว';
  end if;

  select sheet_number, slot_number, control_type, sample_run_id
  into v_sheet, v_slot_number, v_control, v_assigned_run
  from public.nipt_batch_slots
  where id = p_slot and batch_id = p_batch
  for update;
  if not found then raise exception 'Plate position not found'; end if;
  if v_control is not null then raise exception 'Control positions cannot be removed'; end if;
  if v_assigned_run is distinct from p_run then
    raise exception 'ตัวอย่างในตำแหน่งนี้เปลี่ยนไปแล้ว กรุณารีเฟรชหน้า';
  end if;
  if v_assigned_run is null then raise exception 'Plate position is already empty'; end if;

  select finalized_at into v_finalized
  from public.nipt_task_sheets
  where batch_id = p_batch and sheet_number = v_sheet
  for update;
  if not found then raise exception 'Task List not found'; end if;
  if v_finalized is not null then
    raise exception 'ลบไม่ได้: Task List นี้ Finalize แล้ว';
  end if;

  select sample_id, stage, is_active
  into v_sample_id, v_stage, v_active
  from public.nipt_sample_runs where id = p_run for update;
  if not found or v_active is not true or v_stage <> 'Extract' then
    raise exception 'ลบไม่ได้: ตัวอย่างไม่ได้อยู่ในขั้นตอน Extract ที่นำออกได้';
  end if;

  if exists (
    select 1 from public.nipt_qc_measurements
    where batch_slot_id = p_slot and concentration is not null
  ) then
    raise exception 'ลบไม่ได้: ตำแหน่งนี้มีผล QC แล้ว';
  end if;
  if exists (
    select 1 from public.nipt_qc_import_batches qi
    join public.nipt_qc_sheets qs on qs.id = qi.qc_sheet_id
    where qs.batch_id = p_batch
  ) then
    raise exception 'ลบไม่ได้: Batch นี้มีไฟล์ QC Import แล้ว';
  end if;
  if exists (select 1 from public.nipt_result_revisions where sample_id = v_sample_id) then
    raise exception 'ลบไม่ได้: ตัวอย่างมี Result PDF แล้ว';
  end if;
  if exists (select 1 from public.nipt_storage_slots where sample_id = v_sample_id) then
    raise exception 'ลบไม่ได้: ตัวอย่างถูกจัดเก็บแล้ว';
  end if;

  select ln, ln_halos into v_ln, v_halos
  from public.nipt_samples where id = v_sample_id;

  -- Both updates and the audit entry commit or roll back together.
  update public.nipt_batch_slots
  set sample_run_id = null, assigned_at = null, assigned_by = null
  where id = p_slot and batch_id = p_batch and sample_run_id = p_run;
  if not found then raise exception 'Plate position changed; retry'; end if;

  update public.nipt_sample_runs
  set stage = 'Received', updated_at = now()
  where id = p_run and is_active = true and stage = 'Extract';
  if not found then raise exception 'Sample stage changed; retry'; end if;

  insert into public.nipt_audit_logs (actor_id, action, entity_type, entity_id, detail)
  values (
    p_actor, 'task-sheet.sample.remove', 'batch', p_batch::text,
    jsonb_build_object(
      'slotId', p_slot, 'slotNumber', v_slot_number, 'sheetNumber', v_sheet,
      'sampleRunId', p_run, 'sampleId', v_sample_id, 'ln', v_ln, 'lnHalos', v_halos
    )
  );

  return jsonb_build_object(
    'slotId', p_slot, 'slotNumber', v_slot_number, 'sheetNumber', v_sheet,
    'ln', v_ln, 'lnHalos', v_halos
  );
end;
$$;

revoke all on function public.remove_nipt_task_slot_sample(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.remove_nipt_task_slot_sample(uuid, uuid, uuid, uuid)
  to service_role;
