import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202606010002_sample_storage.sql'), 'utf8')

describe('Sample Storage migration contract', () => {
  it('creates one filling 9x9 storage box with 81 unique slots', () => {
    expect(sql).toContain('create unique index nipt_storage_boxes_one_filling')
    expect(sql).toContain('from generate_series(1, 81) slot')
    expect(sql).toContain("substr('ABCDEFGHI', ((slot - 1) % 9) + 1, 1)")
  })

  it('auto-fills patient samples FIFO without assigning one sample twice', () => {
    expect(sql).toContain('sample_id uuid unique references public.nipt_samples(id)')
    expect(sql).toContain('order by s.imported_at, s.id')
    expect(sql).toContain('perform pg_advisory_xact_lock(7302026)')
  })

  it('starts a two-year destruction countdown only after the box reaches 81 samples', () => {
    expect(sql).toContain('if v_occupied = 81 then')
    expect(sql).toContain("destroy_due_date = ((now() at time zone 'Asia/Bangkok')::date + interval '2 years')::date")
  })

  it('allows destruction only when due and keeps mutation RPCs server-only', () => {
    expect(sql).toContain("raise exception 'Storage box is not due for destruction'")
    expect(sql).toContain('revoke all on function public.autofill_nipt_storage(uuid) from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.destroy_nipt_storage_box(uuid, text, uuid) to service_role')
  })
})
