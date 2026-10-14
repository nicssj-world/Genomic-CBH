import { describe, expect, it } from 'vitest'
import { latestSampleIdsByBangkokDay } from './intake-day'

describe('temporary last-registered-sample marker eligibility', () => {
  it('uses Bangkok dates, not UTC dates, across midnight', () => {
    const ids = latestSampleIdsByBangkokDay([
      { id: 'a', importedAt: '2026-10-14T16:59:00Z' },
      { id: 'b', importedAt: '2026-10-14T17:01:00Z' },
      { id: 'c', importedAt: '2026-10-14T17:02:00Z' },
    ])
    expect([...ids].sort()).toEqual(['a', 'c'])
  })

  it('chooses chronological latest despite a reverse input order', () => {
    const ids = latestSampleIdsByBangkokDay([
      { id: 'later', importedAt: '2026-10-15T08:00:00+07:00' },
      { id: 'earlier', importedAt: '2026-10-15T07:00:00+07:00' },
    ])
    expect([...ids]).toEqual(['later'])
  })

  it('is deterministic for equal timestamps and skips invalid timestamps', () => {
    const ids = latestSampleIdsByBangkokDay([
      { id: 'a', importedAt: 'bad' },
      { id: 'a', importedAt: '2026-10-15T08:00:00+07:00' },
      { id: 'b', importedAt: '2026-10-15T08:00:00+07:00' },
    ])
    expect([...ids]).toEqual(['b'])
  })
})
