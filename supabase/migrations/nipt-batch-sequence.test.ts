import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/202610140002_nipt_batch_sequence.sql'),
  'utf8',
)

describe('NIPT extraction Run sequence reconciliation', () => {
  it('allocates after renamed Run labels as well as internal run numbers', () => {
    expect(migration).toContain('max(run_number)')
    expect(migration).toContain('substring(run_label FROM')
    expect(migration).toContain('nipt_batch_sequences.last_value + 1')
    expect(migration).toContain('greatest(')
    expect(migration).toContain("lpad(v_sequence::text, 3, '0')")
    expect(migration).toContain('Annual NIPT batch sequence exceeded 9999')
  })

  it('serializes creation before looking up an existing assembling batch', () => {
    const locked = migration.indexOf('PERFORM pg_advisory_xact_lock(782604, v_year)')
    const existing = migration.indexOf("WHERE status = 'assembling'")
    expect(locked).toBeGreaterThan(0)
    expect(existing).toBeGreaterThan(locked)
    expect(migration).toContain('IF v_existing IS NOT NULL THEN RETURN v_existing')
  })

  it('retains three sheets, 48 positions and fixed control placements', () => {
    expect(migration).toContain('generate_series(1, 3)')
    expect(migration).toContain('generate_series(1, 48)')
    expect(migration).toContain("WHEN 1 THEN 'positive'")
    expect(migration).toContain("WHEN 25 THEN 'negative'")
    expect(migration).toContain("WHEN 40 THEN 'blank'")
  })

  it('keeps browser roles locked out and preserves historical batch rows', () => {
    expect(migration).toContain('SECURITY DEFINER')
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.create_nipt_batch(uuid)')
    expect(migration).toContain('TO service_role')
    expect(migration).toContain('ON CONFLICT (run_year) DO UPDATE')
    expect(migration).not.toMatch(/\bUPDATE\s+public\.nipt_batches\b/i)
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+public\.nipt_batches\b/i)
  })

  it('demonstrates the real mismatch Run002/2026, internal 1, counter 1 -> Run003/2026', () => {
    const runNumber = 1
    const historicalLabel = 'Run002/2026'
    const lastValue = 1
    const labelNumber = Number(/^Run(\d{1,4})\/2026$/.exec(historicalLabel)?.[1] ?? '0')
    const next = Math.max(runNumber, labelNumber, lastValue) + 1
    expect('Run' + String(next).padStart(3, '0') + '/2026').toBe('Run003/2026')
  })
})
