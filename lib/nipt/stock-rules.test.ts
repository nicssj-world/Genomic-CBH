import { describe, expect, it } from 'vitest'
import {
  canApplyStockDelta,
  getStockExpiryState,
  getSuggestedStockLot,
  isStockLow,
  needsExpiredStockConfirmation,
  requiresStockIssueOverride,
  sortStockLotsFefo,
} from './stock-rules'

describe('Stock rules', () => {
  const today = '2026-06-03'

  it('warns within 90 days and marks yesterday as expired', () => {
    expect(getStockExpiryState(null, today)).toBe('none')
    expect(getStockExpiryState('2026-09-01', today)).toBe('expiring')
    expect(getStockExpiryState('2026-09-02', today)).toBe('current')
    expect(getStockExpiryState('2026-06-02', today)).toBe('expired')
    expect(needsExpiredStockConfirmation('2026-06-02', today)).toBe(true)
  })

  it('suggests a non-expired lot using FEFO and keeps expired lots last', () => {
    const lots = [
      { id: 'no-expiry', expiryDate: null, onHand: 5 },
      { id: 'expired', expiryDate: '2026-06-02', onHand: 5 },
      { id: 'later', expiryDate: '2026-07-02', onHand: 5 },
      { id: 'first', expiryDate: '2026-06-30', onHand: 5 },
    ]
    expect(sortStockLotsFefo(lots, today).map((lot) => lot.id)).toEqual(['first', 'later', 'no-expiry', 'expired'])
    expect(getSuggestedStockLot(lots, today)?.id).toBe('first')
  })

  it('flags low usable stock and rejects negative balances', () => {
    expect(isStockLow(3, 3)).toBe(true)
    expect(isStockLow(4, 3)).toBe(false)
    expect(canApplyStockDelta(3, -3)).toBe(true)
    expect(canApplyStockDelta(3, -4)).toBe(false)
  })

  it('requires a reason when issuing a lot other than the FEFO suggestion', () => {
    expect(requiresStockIssueOverride('lot-1', 'lot-1')).toBe(false)
    expect(requiresStockIssueOverride('lot-2', 'lot-1')).toBe(true)
    expect(requiresStockIssueOverride('lot-2', null)).toBe(false)
  })
})
