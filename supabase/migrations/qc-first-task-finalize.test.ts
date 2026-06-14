import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202606150001_qc_first_task_finalize.sql'), 'utf8')

describe('QC first-Task-List migration contract', () => {
  it('starts QC once at least one Task List is finalized', () => {
    expect(sql).toContain('create or replace function public.ensure_nipt_qc_sheet(p_batch uuid, p_actor uuid)')
    expect(sql).toContain("raise exception 'Finalize at least one Task List before starting QC measurements'")
    expect(sql).toContain('where batch_id = p_batch and finalized_at is not null')
  })

  it('no longer requires all three Task Lists or 48 filled slots', () => {
    expect(sql).not.toContain('Finalize all three Task Lists')
    expect(sql).not.toContain('Fill all 48 plate slots')
  })

  it('auto-creates the QC sheet whenever any Task List is finalized', () => {
    expect(sql).toContain('create or replace function public.create_nipt_qc_sheet_after_task_finalize()')
    expect(sql).toContain('if new.finalized_at is not null then')
    expect(sql).toContain('perform public.ensure_nipt_qc_sheet(new.batch_id, new.finalized_by)')
  })

  it('keeps the mutating RPC server-only', () => {
    expect(sql).toContain('revoke all on function public.ensure_nipt_qc_sheet(uuid, uuid) from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.ensure_nipt_qc_sheet(uuid, uuid) to service_role')
  })
})
