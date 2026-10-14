import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/202610140001_nipt_monthly_ln_halos.sql'),
  'utf8',
)

describe('October 2026 monthly LN Halos migration', () => {
  it('anchors October to the owner-confirmed first case and preserves original IDs', () => {
    expect(migration).toContain("ln = '2628270019'")
    expect(migration).toContain("anchor.ln_halos <> '26B261012001'")
    expect(migration).toContain("row_number() OVER (ORDER BY imported_at, id)")
    expect(migration).toContain('UPDATE public.nipt_samples s SET ln_halos=m.new_code')
    expect(migration).toContain('nipt_ln_halos_reassignments')
    expect(migration).toContain("'sample.ln_halos.reassigned'")
    expect(migration).toContain('MONTHLY_LN_HALOS_EXISTING_ISSUED_EVIDENCE_REQUIRES_RECONCILIATION')
  })
  it('allocates new numbers atomically by Bangkok month and fails at 999', () => {
    expect(migration).toContain('nipt_monthly_sequences(sequence_month,last_value)')
    expect(migration).toContain("date_trunc('month', (now() AT TIME ZONE 'Asia/Bangkok'))")
    expect(migration).toContain('ON CONFLICT (sequence_month) DO UPDATE')
    expect(migration).toContain('last_value<999')
    expect(migration).toContain('Monthly LN Halos sequence exceeded 999')
    expect(migration).toContain('pg_advisory_xact_lock(hashtextextended(v_ln, 20261014))')
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.register_nipt_sample')
  })
})
