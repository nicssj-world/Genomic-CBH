import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202606020001_qc_measurements.sql'), 'utf8')

describe('QC Measurements migration contract', () => {
  it('creates one QC sheet per completed extraction batch with 48 measurements', () => {
    expect(sql).toContain('batch_id uuid not null unique references public.nipt_batches(id)')
    expect(sql).toContain('slot_number integer not null check (slot_number between 1 and 48)')
    expect(sql).toContain('select v_qc_sheet, id, slot_number')
  })

  it('starts QC only after all three Task Lists and 48 plate slots are complete', () => {
    expect(sql).toContain("'Finalize all three Task Lists before starting QC measurements'")
    expect(sql).toContain("'QC measurements require three Task Lists'")
    expect(sql).toContain("'QC measurements require 48 plate slots'")
    expect(sql).toContain("'Fill all 48 plate slots before starting QC measurements'")
  })

  it('auto-creates the QC sheet after the last Task List is finalized', () => {
    expect(sql).toContain('create trigger nipt_qc_sheet_after_task_finalize')
    expect(sql).toContain('perform public.ensure_nipt_qc_sheet(new.batch_id, new.finalized_by)')
  })

  it('stores Qubit raw files for mapping later and keeps the mutating RPC server-only', () => {
    expect(sql).toContain('create table public.nipt_qc_import_batches')
    expect(sql).toContain("status text not null default 'awaiting_mapping'")
    expect(sql).toContain('revoke all on function public.ensure_nipt_qc_sheet(uuid, uuid) from public, anon, authenticated')
  })
})
