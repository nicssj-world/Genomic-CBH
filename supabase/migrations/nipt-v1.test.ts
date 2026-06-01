import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202606010001_nipt_v1.sql'), 'utf8')

describe('NIPT migration contract', () => {
  it('allocates daily LN Halos atomically and handles duplicate LN races', () => {
    expect(sql).toContain('on conflict (sequence_date) do update set last_value')
    expect(sql).toContain('exception when unique_violation')
    expect(sql).toContain("'Daily LN Halos sequence exceeded 999'")
  })

  it('keeps one assembling batch and fixed controls', () => {
    expect(sql).toContain('create unique index nipt_batches_one_assembling')
    expect(sql).toContain("case slot when 1 then 'positive' when 25 then 'negative' when 40 then 'blank'")
  })

  it('fills only received runs and locks finalized sheets', () => {
    expect(sql).toContain("r.is_active and r.stage = 'Received'")
    expect(sql).toContain('create trigger nipt_batch_slots_lock_finalized')
    expect(sql).toContain("raise exception 'Task List is finalized'")
  })

  it('does not expose mutating security-definer RPCs to browser roles', () => {
    expect(sql).toContain('revoke all on function public.register_nipt_sample(text, uuid) from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.register_nipt_sample(text, uuid) to service_role')
  })

  it('uses provider-neutral storage keys for local or NAS files', () => {
    expect(sql).toContain('storage_key text not null unique')
    expect(sql).not.toContain('r2_key')
  })
})
