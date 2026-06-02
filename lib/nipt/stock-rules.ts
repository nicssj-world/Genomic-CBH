import { formatBangkokIsoDate } from './rules'

export const STOCK_EXPIRY_WARNING_DAYS = 90

export type StockExpiryState = 'none' | 'current' | 'expiring' | 'expired'

export interface StockRuleLot {
  id: string
  expiryDate: string | null
  onHand: number
  createdAt?: string
}

function dayNumber(value: string) {
  return Date.parse(`${value}T00:00:00Z`) / 86_400_000
}

export function getStockExpiryState(expiryDate: string | null, today = formatBangkokIsoDate()): StockExpiryState {
  if (!expiryDate) return 'none'
  const daysRemaining = dayNumber(expiryDate) - dayNumber(today)
  if (daysRemaining < 0) return 'expired'
  if (daysRemaining <= STOCK_EXPIRY_WARNING_DAYS) return 'expiring'
  return 'current'
}

export function sortStockLotsFefo<T extends StockRuleLot>(lots: T[], today = formatBangkokIsoDate()) {
  return [...lots].sort((left, right) => {
    const leftExpired = getStockExpiryState(left.expiryDate, today) === 'expired'
    const rightExpired = getStockExpiryState(right.expiryDate, today) === 'expired'
    if (leftExpired !== rightExpired) return leftExpired ? 1 : -1
    if (left.expiryDate !== right.expiryDate) {
      if (!left.expiryDate) return 1
      if (!right.expiryDate) return -1
      return left.expiryDate.localeCompare(right.expiryDate)
    }
    if ((left.createdAt ?? '') !== (right.createdAt ?? '')) return (left.createdAt ?? '').localeCompare(right.createdAt ?? '')
    return left.id.localeCompare(right.id)
  })
}

export function getSuggestedStockLot<T extends StockRuleLot>(lots: T[], today = formatBangkokIsoDate()) {
  return sortStockLotsFefo(
    lots.filter((lot) => lot.onHand > 0 && getStockExpiryState(lot.expiryDate, today) !== 'expired'),
    today,
  )[0] ?? null
}

export function isStockLow(usable: number, minimumStock: number) {
  return usable <= minimumStock
}

export function canApplyStockDelta(onHand: number, delta: number) {
  return onHand + delta >= 0
}

export function needsExpiredStockConfirmation(expiryDate: string | null, today = formatBangkokIsoDate()) {
  return getStockExpiryState(expiryDate, today) === 'expired'
}

export function requiresStockIssueOverride(selectedLotId: string, suggestedLotId: string | null) {
  return Boolean(suggestedLotId && selectedLotId !== suggestedLotId)
}
