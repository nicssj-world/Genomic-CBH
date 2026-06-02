import type { StockItem, StockWorkspace } from './types'

export type StockStatusFilter = 'all' | 'low' | 'expiring' | 'expired'

export interface StockExportFilters {
  q?: string
  categoryId?: string
  status?: StockStatusFilter
}

function escapeCsv(value: unknown) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function encodeStockCsv(rows: unknown[][]) {
  return `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')}\r\n`
}

export function filterStockItems(items: StockItem[], filters: StockExportFilters = {}) {
  const q = filters.q?.trim().toLowerCase()
  return items.filter((item) => {
    if (q && !`${item.itemCode} ${item.name} ${item.categoryName}`.toLowerCase().includes(q)) return false
    if (filters.categoryId && item.categoryId !== filters.categoryId) return false
    if (filters.status === 'low' && !item.isLowStock) return false
    if (filters.status === 'expiring' && !item.lots.some((lot) => lot.onHand > 0 && lot.expiryState === 'expiring')) return false
    if (filters.status === 'expired' && !item.lots.some((lot) => lot.onHand > 0 && lot.expiryState === 'expired')) return false
    return true
  })
}

function itemStatus(item: StockItem) {
  const statuses: string[] = []
  if (item.isLowStock) statuses.push('LOW STOCK')
  if (item.lots.some((lot) => lot.onHand > 0 && lot.expiryState === 'expired')) statuses.push('EXPIRED LOT')
  if (item.lots.some((lot) => lot.onHand > 0 && lot.expiryState === 'expiring')) statuses.push('EXPIRING LOT')
  return statuses.join(' | ') || 'OK'
}

export function buildStockBalancesCsv(workspace: StockWorkspace, filters: StockExportFilters = {}) {
  const rows: unknown[][] = [[
    'Item code', 'Item', 'Category', 'On hand', 'Usable', 'Unit', 'Minimum stock', 'Status',
  ]]
  for (const item of filterStockItems(workspace.items, filters)) {
    rows.push([item.itemCode, item.name, item.categoryName, item.onHand, item.usable, item.unit, item.minimumStock, itemStatus(item)])
  }
  return encodeStockCsv(rows)
}

export function buildStockMovementsCsv(workspace: StockWorkspace, filters: StockExportFilters = {}) {
  const matchedItemIds = new Set(filterStockItems(workspace.items, filters).map((item) => item.id))
  const rows: unknown[][] = [[
    'Date', 'Type', 'Item code', 'Item', 'Lot', 'Expiry', 'Quantity', 'Unit', 'Supplier', 'Reference', 'Note',
    'FEFO override reason', 'Expired confirmed', 'Operator', 'Source movement',
  ]]
  const lots = new Map(workspace.items.flatMap((item) => item.lots.map((lot) => [lot.id, lot] as const)))
  for (const movement of workspace.movements.filter((item) => matchedItemIds.has(item.itemId))) {
    rows.push([
      movement.createdAt, movement.movementType, movement.itemCode, movement.itemName, movement.lotNumber,
      lots.get(movement.lotId)?.expiryDate ?? '', movement.quantity, movement.unit, movement.supplier, movement.reference,
      movement.note, movement.overrideReason, movement.expiredConfirmed ? 'YES' : 'NO', movement.createdByName,
      movement.sourceMovementId,
    ])
  }
  return encodeStockCsv(rows)
}
