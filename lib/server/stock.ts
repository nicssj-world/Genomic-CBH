import 'server-only'

import { getStockExpiryState, sortStockLotsFefo } from '@/lib/nipt/stock-rules'
import type { Actor, StockCategory, StockItem, StockLot, StockMovement, StockWorkspace } from '@/lib/nipt/types'
import { writeAudit } from '@/lib/server/data'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

function fail(error: { message: string } | null, message = 'Stock database operation failed') {
  if (error) throw new HttpError(400, error.message || message)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function clean(value: string | null | undefined) {
  return value?.trim() || null
}

function number(value: unknown) {
  return Number(value ?? 0)
}

function ids(rows: RecordRow[], key: string) {
  return [...new Set(rows.map((row) => asString(row[key])).filter(Boolean))]
}

async function getNameMap(userIds: string[]) {
  if (!userIds.length) return new Map<string, string>()
  const { data, error } = await getAdminClient().from('nipt_users').select('id,display_name').in('id', userIds)
  fail(error)
  return new Map((data ?? []).map((row) => [row.id, row.display_name]))
}

export async function getStockWorkspace(actor: Actor): Promise<StockWorkspace> {
  const admin = getAdminClient()
  const [
    { data: categoryData, error: categoryError },
    { data: itemData, error: itemError },
    { data: lotData, error: lotError },
    { data: movementData, error: movementError },
  ] = await Promise.all([
    admin.from('nipt_stock_categories').select('*').order('name'),
    admin.from('nipt_stock_items').select('*').order('item_code'),
    admin.from('nipt_stock_lots').select('*').order('created_at'),
    admin.from('nipt_stock_movements').select('*').order('created_at', { ascending: false }),
  ])
  fail(categoryError)
  fail(itemError)
  fail(lotError)
  fail(movementError)

  const categoryRows = (categoryData ?? []) as RecordRow[]
  const itemRows = (itemData ?? []) as RecordRow[]
  const lotRows = (lotData ?? []) as RecordRow[]
  const movementRows = (movementData ?? []) as RecordRow[]
  const nameMap = await getNameMap(ids(movementRows, 'created_by'))
  const categoryMap = new Map(categoryRows.map((row) => [asString(row.id), asString(row.name)]))
  const balanceMap = new Map<string, number>()
  for (const movement of movementRows) {
    const lotId = asString(movement.lot_id)
    balanceMap.set(lotId, (balanceMap.get(lotId) ?? 0) + number(movement.quantity))
  }

  const lots = lotRows.map((row): StockLot => {
    const expiryDate = nullableString(row.expiry_date)
    const onHand = balanceMap.get(asString(row.id)) ?? 0
    const expiryState = getStockExpiryState(expiryDate)
    return {
      id: asString(row.id),
      itemId: asString(row.item_id),
      lotNumber: asString(row.lot_number),
      expiryDate,
      expiryState,
      onHand,
      usable: expiryState === 'expired' ? 0 : onHand,
      createdAt: asString(row.created_at),
    }
  })
  const lotMap = new Map(lots.map((lot) => [lot.id, lot]))
  const items = itemRows.map((row): StockItem => {
    const itemLots = sortStockLotsFefo(lots.filter((lot) => lot.itemId === asString(row.id)))
    const onHand = itemLots.reduce((total, lot) => total + lot.onHand, 0)
    const usable = itemLots.reduce((total, lot) => total + lot.usable, 0)
    const minimumStock = number(row.minimum_stock)
    return {
      id: asString(row.id),
      itemCode: asString(row.item_code),
      name: asString(row.name),
      categoryId: asString(row.category_id),
      categoryName: categoryMap.get(asString(row.category_id)) ?? '-',
      unit: asString(row.unit),
      minimumStock,
      trackLot: Boolean(row.track_lot),
      trackExpiry: Boolean(row.track_expiry),
      isActive: Boolean(row.is_active),
      onHand,
      usable,
      isLowStock: usable <= minimumStock,
      lots: itemLots,
    }
  })
  const itemMap = new Map(items.map((item) => [item.id, item]))
  const reversedByMap = new Map(
    movementRows
      .filter((row) => nullableString(row.source_movement_id))
      .map((row) => [asString(row.source_movement_id), asString(row.id)]),
  )
  const movements = movementRows.map((row): StockMovement => {
    const lot = lotMap.get(asString(row.lot_id))
    const item = itemMap.get(lot?.itemId ?? '')
    const reversedByMovementId = reversedByMap.get(asString(row.id)) ?? null
    const createdBy = asString(row.created_by)
    return {
      id: asString(row.id),
      itemId: item?.id ?? '',
      itemCode: item?.itemCode ?? '',
      itemName: item?.name ?? '',
      unit: item?.unit ?? '',
      lotId: lot?.id ?? '',
      lotNumber: lot?.lotNumber ?? '',
      movementType: asString(row.movement_type) as StockMovement['movementType'],
      quantity: number(row.quantity),
      supplier: nullableString(row.supplier_text),
      reference: nullableString(row.reference_text),
      note: nullableString(row.note),
      overrideReason: nullableString(row.override_reason),
      expiredConfirmed: Boolean(row.expired_confirmed),
      sourceMovementId: nullableString(row.source_movement_id),
      reversedByMovementId,
      createdBy,
      createdByName: nameMap.get(createdBy) ?? null,
      createdAt: asString(row.created_at),
      canReverse: !reversedByMovementId && (actor.role === 'Admin' || createdBy === actor.id),
    }
  })
  const activeItems = items.filter((item) => item.isActive)
  const stockedLots = lots.filter((lot) => lot.onHand > 0)
  return {
    categories: categoryRows.map((row): StockCategory => ({
      id: asString(row.id),
      name: asString(row.name),
      isActive: Boolean(row.is_active),
    })),
    items,
    movements,
    activeItemCount: activeItems.length,
    lowStockItemCount: activeItems.filter((item) => item.isLowStock).length,
    expiringLotCount: stockedLots.filter((lot) => lot.expiryState === 'expiring').length,
    expiredLotCount: stockedLots.filter((lot) => lot.expiryState === 'expired').length,
  }
}

async function assertActiveCategory(categoryId: string) {
  const { data, error } = await getAdminClient().from('nipt_stock_categories').select('id').eq('id', categoryId).eq('is_active', true).maybeSingle()
  fail(error)
  if (!data) throw new HttpError(400, 'Active stock category not found')
}

function assertTracking(trackLot: boolean, trackExpiry: boolean) {
  if (trackExpiry && !trackLot) throw new HttpError(400, 'Expiry tracking requires lot tracking')
}

export async function createStockCategory(name: string, actor: Actor) {
  const { data, error } = await getAdminClient()
    .from('nipt_stock_categories')
    .insert({ name: name.trim(), created_by: actor.id })
    .select('id')
    .single()
  fail(error)
  await writeAudit(actor, 'stock.category.create', 'stock-category', data!.id, { name: name.trim() })
  return getStockWorkspace(actor)
}

export async function updateStockCategory(categoryId: string, input: { name?: string; isActive?: boolean }, actor: Actor) {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) updates.name = input.name.trim()
  if (input.isActive !== undefined) updates.is_active = input.isActive
  const { data, error } = await getAdminClient()
    .from('nipt_stock_categories')
    .update(updates)
    .eq('id', categoryId)
    .select('id')
    .maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'Stock category not found')
  await writeAudit(actor, 'stock.category.update', 'stock-category', categoryId, input)
  return getStockWorkspace(actor)
}

export async function createStockItem(input: {
  itemCode: string
  name: string
  categoryId: string
  unit: string
  minimumStock: number
  trackLot: boolean
  trackExpiry: boolean
}, actor: Actor) {
  assertTracking(input.trackLot, input.trackExpiry)
  await assertActiveCategory(input.categoryId)
  const { data, error } = await getAdminClient()
    .from('nipt_stock_items')
    .insert({
      item_code: input.itemCode.trim(),
      name: input.name.trim(),
      category_id: input.categoryId,
      unit: input.unit.trim(),
      minimum_stock: input.minimumStock,
      track_lot: input.trackLot,
      track_expiry: input.trackExpiry,
      created_by: actor.id,
    })
    .select('id')
    .single()
  fail(error)
  await writeAudit(actor, 'stock.item.create', 'stock-item', data!.id, input)
  return getStockWorkspace(actor)
}

export async function updateStockItem(itemId: string, input: {
  itemCode?: string
  name?: string
  categoryId?: string
  unit?: string
  minimumStock?: number
  trackLot?: boolean
  trackExpiry?: boolean
  isActive?: boolean
}, actor: Actor) {
  const admin = getAdminClient()
  const { data: item, error: itemError } = await admin.from('nipt_stock_items').select('*').eq('id', itemId).maybeSingle()
  fail(itemError)
  if (!item) throw new HttpError(404, 'Stock item not found')
  const trackLot = input.trackLot ?? item.track_lot
  const trackExpiry = input.trackExpiry ?? item.track_expiry
  assertTracking(trackLot, trackExpiry)
  if (input.categoryId) await assertActiveCategory(input.categoryId)
  if (trackLot !== item.track_lot || trackExpiry !== item.track_expiry) {
    const { count, error } = await admin
      .from('nipt_stock_movements')
      .select('id,nipt_stock_lots!inner(item_id)', { count: 'exact', head: true })
      .eq('nipt_stock_lots.item_id', itemId)
    fail(error)
    if (count) throw new HttpError(409, 'Cannot change lot tracking after stock movements exist')
  }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.itemCode !== undefined) updates.item_code = input.itemCode.trim()
  if (input.name !== undefined) updates.name = input.name.trim()
  if (input.categoryId !== undefined) updates.category_id = input.categoryId
  if (input.unit !== undefined) updates.unit = input.unit.trim()
  if (input.minimumStock !== undefined) updates.minimum_stock = input.minimumStock
  if (input.trackLot !== undefined) updates.track_lot = input.trackLot
  if (input.trackExpiry !== undefined) updates.track_expiry = input.trackExpiry
  if (input.isActive !== undefined) updates.is_active = input.isActive
  const { error } = await admin.from('nipt_stock_items').update(updates).eq('id', itemId)
  fail(error)
  await writeAudit(actor, 'stock.item.update', 'stock-item', itemId, input)
  return getStockWorkspace(actor)
}

export async function receiveStock(input: {
  itemId: string
  lotNumber?: string | null
  expiryDate?: string | null
  quantity: number
  supplier?: string | null
  reference?: string | null
  note?: string | null
}, actor: Actor) {
  const { data, error } = await getAdminClient().rpc('receive_nipt_stock', {
    p_item: input.itemId,
    p_lot_number: clean(input.lotNumber),
    p_expiry_date: input.expiryDate || null,
    p_quantity: input.quantity,
    p_supplier_text: clean(input.supplier),
    p_reference_text: clean(input.reference),
    p_note: clean(input.note),
    p_actor: actor.id,
  })
  fail(error)
  await writeAudit(actor, 'stock.receive', 'stock-movement', asString(data), input)
  return getStockWorkspace(actor)
}

export async function issueStock(input: {
  lotId: string
  quantity: number
  reference?: string | null
  note?: string | null
  overrideReason?: string | null
  expiredConfirmed: boolean
}, actor: Actor) {
  const { data, error } = await getAdminClient().rpc('issue_nipt_stock', {
    p_lot: input.lotId,
    p_quantity: input.quantity,
    p_reference_text: clean(input.reference),
    p_note: clean(input.note),
    p_override_reason: clean(input.overrideReason),
    p_expired_confirmed: input.expiredConfirmed,
    p_actor: actor.id,
  })
  fail(error)
  await writeAudit(actor, 'stock.issue', 'stock-movement', asString(data), input)
  return getStockWorkspace(actor)
}

export async function adjustStock(input: { lotId: string; quantity: number; reference?: string | null; note: string }, actor: Actor) {
  const { data, error } = await getAdminClient().rpc('adjust_nipt_stock', {
    p_lot: input.lotId,
    p_quantity: input.quantity,
    p_reference_text: clean(input.reference),
    p_note: input.note.trim(),
    p_actor: actor.id,
  })
  fail(error)
  await writeAudit(actor, 'stock.adjust', 'stock-movement', asString(data), input)
  return getStockWorkspace(actor)
}

export async function reverseStockMovement(movementId: string, reason: string, actor: Actor) {
  const { data, error } = await getAdminClient().rpc('reverse_nipt_stock_movement', {
    p_movement: movementId,
    p_reason: reason.trim(),
    p_actor: actor.id,
  })
  fail(error)
  await writeAudit(actor, 'stock.reverse', 'stock-movement', asString(data), { sourceMovementId: movementId, reason: reason.trim() })
  return getStockWorkspace(actor)
}

export async function logStockExport(report: string, actor: Actor) {
  await writeAudit(actor, 'stock.export', 'stock', undefined, { report })
}
