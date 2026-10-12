import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/202610120001_remove_nipt_task_slot_sample.sql'), 'utf8')
const taskView = readFileSync(join(process.cwd(), 'components/task-lists-view.tsx'), 'utf8')
const patientsView = readFileSync(join(process.cwd(), 'components/patients-view.tsx'), 'utf8')
const route = readFileSync(join(process.cwd(), 'app/api/batches/[id]/slots/[slot]/remove/route.ts'), 'utf8')

describe('Task List removal safety contract', () => {
  it('keeps the SQL operation transactional and admin-only', () => {
    expect(migration).toContain('security definer')
    expect(migration).toContain("role = 'Admin'")
    expect(migration).toContain('for update')
    expect(migration).toContain("v_batch_status <> 'assembling'")
    expect(migration).toContain('v_finalized is not null')
    expect(migration).toContain('v_assigned_run is distinct from p_run')
    expect(migration).toContain("v_stage <> 'Extract'")
    expect(migration).toContain('where batch_slot_id = p_slot and concentration is not null')
    expect(migration).toContain('nipt_qc_import_batches')
    expect(migration).toContain('nipt_result_revisions')
    expect(migration).toContain('nipt_storage_slots')
    expect(migration).toContain('sample_run_id = null, assigned_at = null, assigned_by = null')
    expect(migration).toContain("stage = 'Received'")
    expect(migration).toContain("'task-sheet.sample.remove'")
    expect(migration).toContain('revoke all on function public.remove_nipt_task_slot_sample')
    expect(migration).toContain('to service_role;')
    expect(migration).not.toContain('delete from public.nipt_samples')
  })
  it('requires authenticated admin and an expected sample run', () => {
    expect(route).toContain('await requireAdmin()')
    expect(route).toContain('z.string().uuid()')
    expect(taskView).toContain("actor.role === 'Admin' && batch.status === 'assembling' && !sheet?.finalizedAt")
    expect(taskView).toContain('setPendingRemoval')
    expect(taskView).toContain('ยืนยันนำออก')
    expect(taskView).toContain('สามารถลบตัวอย่างได้ที่ทะเบียนคนไข้')
  })
  it('reports partial bulk deletion errors without treating them as success', () => {
    expect(patientsView).toContain('Promise.allSettled')
    expect(patientsView).toContain("setNoticeTone(completed ? 'warning' : 'danger')")
    expect(patientsView).toContain('setSelectedIds(new Set(failed.map')
  })
})
