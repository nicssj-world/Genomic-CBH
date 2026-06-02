'use client'

import { useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CalendarClock,
  FileDown,
  History,
  PackageCheck,
  PackageOpen,
  PackageSearch,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  ShieldAlert,
  X,
} from 'lucide-react'
import { filterStockItems, type StockStatusFilter } from '@/lib/nipt/stock-csv'
import { getSuggestedStockLot, requiresStockIssueOverride } from '@/lib/nipt/stock-rules'
import type { Actor, StockCategory, StockItem, StockLot, StockMovement, StockWorkspace } from '@/lib/nipt/types'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, Textarea } from '@/components/ui'

type ModalName = 'receive' | 'issue' | 'master' | null

export function StockView({ actor, initialData }: { actor: Actor; initialData: StockWorkspace }) {
  const [data, setData] = useState(initialData)
  const [selectedItemId, setSelectedItemId] = useState(initialData.items[0]?.id ?? '')
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<StockStatusFilter>('all')
  const [modal, setModal] = useState<ModalName>(null)
  const [adjustLot, setAdjustLot] = useState<StockLot | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  const visibleItems = useMemo(() => filterStockItems(data.items, { q, categoryId: categoryId || undefined, status }), [categoryId, data.items, q, status])
  const selectedItem = visibleItems.find((item) => item.id === selectedItemId) ?? visibleItems[0] ?? null
  const itemMovements = selectedItem ? data.movements.filter((movement) => movement.itemId === selectedItem.id) : []
  const issueReady = data.items.some((item) => item.isActive && item.lots.some((lot) => lot.onHand > 0))

  function updateData(stock: StockWorkspace, message: string) {
    setData(stock)
    setNotice({ tone: 'success', text: message })
  }

  function exportCsv(report: 'balances' | 'movements') {
    const params = new URLSearchParams({ report, status })
    if (q.trim()) params.set('q', q.trim())
    if (categoryId) params.set('categoryId', categoryId)
    window.location.href = `/api/stock/export?${params}`
  }

  async function reverse(movement: StockMovement) {
    const reason = window.prompt(`ระบุเหตุผลที่ต้อง Reverse รายการ ${movement.movementType} ${formatQuantity(movement.quantity)} ${movement.unit}`)
    if (!reason?.trim()) return
    try {
      const result = await api<{ stock: StockWorkspace }>(`/api/stock/movements/${movement.id}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      updateData(result.stock, 'Reverse transaction แล้ว')
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'Reverse transaction ไม่สำเร็จ' })
    }
  }

  return <div className="mx-auto max-w-[1650px] space-y-5">
    <PageHeader
      eyebrow="Laboratory inventory ledger"
      title="Stock Management"
      description="ติดตามวัสดุคงเหลือ รับเข้า เบิกออก และวันหมดอายุระดับ Lot ด้วยประวัติแบบแก้ย้อนหลังไม่ได้"
      actions={<div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => exportCsv('balances')}><FileDown className="size-4" /> ยอดคงเหลือ CSV</Button>
        <Button variant="secondary" onClick={() => exportCsv('movements')}><History className="size-4" /> Ledger CSV</Button>
        {actor.role === 'Admin' ? <Button variant="secondary" onClick={() => setModal('master')}><Settings2 className="size-4" /> Master data</Button> : null}
        <Button variant="secondary" onClick={() => setModal('receive')} disabled={!data.items.some((item) => item.isActive)}><ArrowDownToLine className="size-4" /> รับเข้า Stock</Button>
        <Button onClick={() => setModal('issue')} disabled={!issueReady}><ArrowUpFromLine className="size-4" /> เบิกออก</Button>
      </div>}
    />

    {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StockKpi icon={<PackageSearch />} label="สินค้า Active" value={data.activeItemCount} />
      <StockKpi icon={<PackageOpen />} label="Low stock" value={data.lowStockItemCount} tone="danger" />
      <StockKpi icon={<CalendarClock />} label="Lot ใกล้หมดอายุ ≤ 90 วัน" value={data.expiringLotCount} tone="amber" />
      <StockKpi icon={<ShieldAlert />} label="Lot หมดอายุ" value={data.expiredLotCount} tone="danger" />
    </div>

    <Card className="overflow-hidden">
      <div className="grid gap-2 border-b border-[#e0e9ea] bg-[#fbfdfd] p-3 sm:grid-cols-[minmax(0,1fr)_190px_170px]">
        <div className="relative">
          <PackageSearch className="absolute top-2.5 left-3 size-4 text-[#8ca1a5]" />
          <Input className="pl-9" value={q} onChange={(event) => setQ(event.target.value)} placeholder="ค้นหา item code, ชื่อสินค้า หรือหมวดหมู่" />
        </div>
        <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">ทุกหมวดหมู่</option>
          {data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.isActive ? '' : ' (inactive)'}</option>)}
        </Select>
        <Select value={status} onChange={(event) => setStatus(event.target.value as StockStatusFilter)}>
          <option value="all">ทุกสถานะ</option>
          <option value="low">Low stock</option>
          <option value="expiring">ใกล้หมดอายุ</option>
          <option value="expired">หมดอายุ</option>
        </Select>
      </div>
      <div className="grid min-h-[620px] xl:grid-cols-[minmax(560px,0.95fr)_minmax(0,1.05fr)]">
        <div className="overflow-x-auto border-b border-[#e0e9ea] xl:border-r xl:border-b-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[#f7fafa] text-[10px] tracking-[0.08em] text-[#779097] uppercase"><tr><th className="px-4 py-2.5">Item</th><th className="px-3 py-2.5 text-right">On hand</th><th className="px-3 py-2.5 text-right">Usable</th><th className="px-3 py-2.5">Minimum</th><th className="px-4 py-2.5">Status</th></tr></thead>
            <tbody className="divide-y divide-[#edf2f2]">
              {visibleItems.map((item) => <tr key={item.id} onClick={() => setSelectedItemId(item.id)} className={`cursor-pointer transition hover:bg-[#f6fbfa] ${selectedItem?.id === item.id ? 'bg-[#eef9f7]' : ''}`}>
                <td className="px-4 py-3"><p className="mono text-xs font-bold text-[#173d50]">{item.itemCode}</p><p className="mt-1 font-semibold text-[#55727c]">{item.name}</p><p className="mt-0.5 text-[10px] text-[#91a3a7]">{item.categoryName}{item.isActive ? '' : ' · INACTIVE'}</p></td>
                <td className="mono px-3 py-3 text-right font-bold text-[#355b66]">{formatQuantity(item.onHand)}</td>
                <td className={`mono px-3 py-3 text-right font-bold ${item.isLowStock ? 'text-[#be3d49]' : 'text-[#087f79]'}`}>{formatQuantity(item.usable)}</td>
                <td className="px-3 py-3 text-xs text-[#7e9297]">{formatQuantity(item.minimumStock)} {item.unit}</td>
                <td className="px-4 py-3"><ItemAlerts item={item} /></td>
              </tr>)}
            </tbody>
          </table>
          {!visibleItems.length ? <p className="px-4 py-14 text-center text-sm text-[#91a4a9]">ไม่พบสินค้าตามตัวกรอง</p> : null}
        </div>
        <StockDetail actor={actor} item={selectedItem} movements={itemMovements} onAdjust={setAdjustLot} onReverse={reverse} />
      </div>
    </Card>

    {modal === 'receive' ? <ReceiveModal items={data.items} selectedItemId={selectedItem?.id} onClose={() => setModal(null)} onSaved={(stock) => { setModal(null); updateData(stock, 'บันทึกรับเข้า Stock แล้ว') }} /> : null}
    {modal === 'issue' ? <IssueModal items={data.items} selectedItemId={selectedItem?.id} onClose={() => setModal(null)} onSaved={(stock) => { setModal(null); updateData(stock, 'บันทึกเบิก Stock แล้ว') }} /> : null}
    {modal === 'master' && actor.role === 'Admin' ? <MasterModal data={data} onClose={() => setModal(null)} onSaved={(stock, message) => updateData(stock, message)} /> : null}
    {adjustLot && actor.role === 'Admin' ? <AdjustModal lot={adjustLot} item={data.items.find((item) => item.id === adjustLot.itemId)!} onClose={() => setAdjustLot(null)} onSaved={(stock) => { setAdjustLot(null); updateData(stock, 'บันทึกปรับยอด Stock แล้ว') }} /> : null}
  </div>
}

function StockDetail({ actor, item, movements, onAdjust, onReverse }: { actor: Actor; item: StockItem | null; movements: StockMovement[]; onAdjust: (lot: StockLot) => void; onReverse: (movement: StockMovement) => void }) {
  if (!item) return <div className="flex min-h-[520px] items-center justify-center p-8 text-center"><div><Boxes className="mx-auto size-10 text-[#b6c6c9]" /><p className="mt-3 text-sm text-[#82979d]">ยังไม่มีสินค้าใน Stock</p>{actor.role === 'Admin' ? <p className="mt-1 text-xs text-[#a0b0b3]">เริ่มจากเพิ่มหมวดหมู่และสินค้าใน Master data</p> : null}</div></div>
  return <div className="min-w-0">
    <div className="border-b border-[#e0e9ea] bg-[linear-gradient(115deg,#fafdfe,#f0f9f7)] px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="mono text-[11px] font-bold tracking-[0.14em] text-[#087f79] uppercase">{item.itemCode}</p><h2 className="mt-1 text-xl font-bold text-[#173d50]">{item.name}</h2><p className="mt-1 text-xs text-[#789097]">{item.categoryName} · หน่วยนับ {item.unit} · ขั้นต่ำ {formatQuantity(item.minimumStock)}</p></div>
        <ItemAlerts item={item} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="On hand" value={`${formatQuantity(item.onHand)} ${item.unit}`} />
        <MiniStat label="Usable" value={`${formatQuantity(item.usable)} ${item.unit}`} accent={item.isLowStock} />
        <MiniStat label="Lot tracking" value={item.trackLot ? 'เปิด' : 'ไม่ติดตาม'} />
        <MiniStat label="Expiry tracking" value={item.trackExpiry ? 'เปิด' : 'ไม่ติดตาม'} />
      </div>
    </div>

    <section className="border-b border-[#e0e9ea] px-4 py-4">
      <div className="flex items-center justify-between"><div><h3 className="font-bold text-[#173d50]">Lots</h3><p className="mt-0.5 text-xs text-[#87999e]">เรียงตาม FEFO โดย Lot ที่ควรใช้ก่อนอยู่ด้านบน</p></div><PackageCheck className="size-5 text-[#087f79]" /></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {item.lots.map((lot) => <LotCard key={lot.id} lot={lot} unit={item.unit} admin={actor.role === 'Admin'} onAdjust={() => onAdjust(lot)} />)}
        {!item.lots.length ? <p className="col-span-full rounded-lg border border-dashed border-[#d5e2e3] px-3 py-7 text-center text-sm text-[#91a4a9]">ยังไม่มี Lot รับเข้า</p> : null}
      </div>
    </section>

    <section>
      <div className="flex items-center gap-2 border-b border-[#edf2f2] px-4 py-3"><History className="size-4 text-[#087f79]" /><h3 className="font-bold text-[#173d50]">Movement ledger</h3></div>
      <div className="max-h-[360px] overflow-y-auto">
        {movements.map((movement) => <MovementRow key={movement.id} movement={movement} onReverse={() => onReverse(movement)} />)}
        {!movements.length ? <p className="px-4 py-8 text-center text-sm text-[#91a4a9]">ยังไม่มี transaction</p> : null}
      </div>
    </section>
  </div>
}

function LotCard({ lot, unit, admin, onAdjust }: { lot: StockLot; unit: string; admin: boolean; onAdjust: () => void }) {
  const color = lot.expiryState === 'expired' ? 'border-[#efc7cc] bg-[#fff8f8]' : lot.expiryState === 'expiring' ? 'border-[#eed4a6] bg-[#fffdf7]' : 'border-[#d8e6e6] bg-white'
  return <div className={`rounded-lg border p-3 ${color}`}>
    <div className="flex items-start justify-between gap-2"><div><p className="mono text-xs font-bold text-[#315763]">{lot.lotNumber}</p><p className="mt-1 text-[11px] text-[#8b9da2]">{lot.expiryDate ? `EXP ${formatDate(lot.expiryDate)}` : 'ไม่ติดตามวันหมดอายุ'}</p></div><ExpiryBadge state={lot.expiryState} /></div>
    <div className="mt-3 flex items-end justify-between gap-2"><div><p className="text-[10px] font-bold tracking-[0.08em] text-[#8da0a4] uppercase">On hand</p><p className="mono mt-0.5 text-lg font-bold text-[#173d50]">{formatQuantity(lot.onHand)} <span className="text-[11px] font-semibold text-[#789097]">{unit}</span></p></div>{admin ? <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onAdjust}><Pencil className="size-3" /> ปรับยอด</Button> : null}</div>
  </div>
}

function MovementRow({ movement, onReverse }: { movement: StockMovement; onReverse: () => void }) {
  const positive = movement.quantity > 0
  return <div className="border-b border-[#edf2f2] px-4 py-3 last:border-0">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><div className="flex flex-wrap items-center gap-2"><MovementBadge type={movement.movementType} /><span className="mono text-xs font-bold text-[#55727c]">{movement.lotNumber}</span>{movement.reversedByMovementId ? <span className="rounded bg-[#f2f5f5] px-1.5 py-0.5 text-[9px] font-bold text-[#87999e]">REVERSED</span> : null}</div><p className="mt-1 text-[11px] text-[#91a3a7]">{formatDateTime(movement.createdAt)} · {movement.createdByName ?? '-'}</p></div>
      <div className="text-right"><p className={`mono text-sm font-bold ${positive ? 'text-[#087f79]' : 'text-[#be3d49]'}`}>{positive ? '+' : ''}{formatQuantity(movement.quantity)} {movement.unit}</p>{movement.canReverse ? <button onClick={onReverse} className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-[#789097] hover:text-[#be3d49]"><RotateCcw className="size-3" /> Reverse</button> : null}</div>
    </div>
    {movement.reference || movement.note || movement.overrideReason ? <p className="mt-2 text-[11px] leading-5 text-[#7f9398]">{movement.reference ? `Ref: ${movement.reference}` : ''}{movement.note ? `${movement.reference ? ' · ' : ''}${movement.note}` : ''}{movement.overrideReason ? ` · FEFO override: ${movement.overrideReason}` : ''}</p> : null}
  </div>
}

function ReceiveModal({ items, selectedItemId, onClose, onSaved }: { items: StockItem[]; selectedItemId?: string; onClose: () => void; onSaved: (stock: StockWorkspace) => void }) {
  const activeItems = items.filter((item) => item.isActive)
  const [form, setForm] = useState({ itemId: activeItems.some((item) => item.id === selectedItemId) ? selectedItemId! : activeItems[0]?.id ?? '', lotNumber: '', expiryDate: '', quantity: '', supplier: '', reference: '', note: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const item = activeItems.find((candidate) => candidate.id === form.itemId)
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result = await api<{ stock: StockWorkspace }>('/api/stock/receipts', { method: 'POST', body: JSON.stringify({ ...form, quantity: Number(form.quantity), lotNumber: item?.trackLot ? form.lotNumber : null, expiryDate: item?.trackExpiry ? form.expiryDate : null }) })
      onSaved(result.stock)
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'บันทึกรับเข้าไม่สำเร็จ') } finally { setBusy(false) }
  }
  return <Modal title="รับเข้า Stock" description="เพิ่มจำนวนเข้าคลังกลางและบันทึก Lot เพื่อใช้เรียง FEFO" icon={<ArrowDownToLine />} onClose={onClose}><form onSubmit={submit} className="space-y-3">
    <Field label="สินค้า"><Select required value={form.itemId} onChange={(event) => setForm({ ...form, itemId: event.target.value, lotNumber: '', expiryDate: '' })}>{activeItems.map((option) => <option key={option.id} value={option.id}>{option.itemCode} · {option.name}</option>)}</Select></Field>
    <div className="grid gap-3 sm:grid-cols-2">{item?.trackLot ? <Field label="Lot number"><Input required value={form.lotNumber} onChange={(event) => setForm({ ...form, lotNumber: event.target.value })} /></Field> : <Field label="Lot number"><Input disabled value="ไม่ระบุ Lot" /></Field>}{item?.trackExpiry ? <Field label="วันหมดอายุ"><Input required type="date" value={form.expiryDate} onChange={(event) => setForm({ ...form, expiryDate: event.target.value })} /></Field> : <Field label="วันหมดอายุ"><Input disabled value="ไม่ติดตาม" /></Field>}</div>
    <div className="grid gap-3 sm:grid-cols-2"><Field label={`จำนวน${item ? ` (${item.unit})` : ''}`}><Input required type="number" min="0.001" step="0.001" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></Field><Field label="Supplier (ไม่บังคับ)"><Input value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} /></Field></div>
    <Field label="Reference (ไม่บังคับ)"><Input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder="เช่น เลขใบรับ หรือเลขเอกสาร" /></Field>
    <Field label="หมายเหตุ (ไม่บังคับ)"><Textarea rows={2} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field>
    <ModalActions busy={busy} error={error} onClose={onClose} submitLabel="บันทึกรับเข้า" />
  </form></Modal>
}

function IssueModal({ items, selectedItemId, onClose, onSaved }: { items: StockItem[]; selectedItemId?: string; onClose: () => void; onSaved: (stock: StockWorkspace) => void }) {
  const eligibleItems = items.filter((item) => item.isActive && item.lots.some((lot) => lot.onHand > 0))
  const firstItemId = eligibleItems.some((item) => item.id === selectedItemId) ? selectedItemId! : eligibleItems[0]?.id ?? ''
  const firstItem = eligibleItems.find((item) => item.id === firstItemId)
  const firstLots = firstItem?.lots.filter((lot) => lot.onHand > 0) ?? []
  const [form, setForm] = useState({ itemId: firstItemId, lotId: getSuggestedStockLot(firstLots)?.id ?? firstLots[0]?.id ?? '', quantity: '', reference: '', note: '', overrideReason: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const item = eligibleItems.find((candidate) => candidate.id === form.itemId)
  const lots = item?.lots.filter((lot) => lot.onHand > 0) ?? []
  const suggestedLot = getSuggestedStockLot(lots)
  const selectedLot = lots.find((lot) => lot.id === form.lotId) ?? null
  const overrideRequired = selectedLot ? requiresStockIssueOverride(selectedLot.id, suggestedLot?.id ?? null) : false
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedLot) return
    const expired = selectedLot.expiryState === 'expired'
    if (expired && !window.confirm(`Lot ${selectedLot.lotNumber} หมดอายุแล้ว ยืนยันว่าต้องการเบิก Lot นี้หรือไม่?`)) return
    setBusy(true); setError('')
    try {
      const result = await api<{ stock: StockWorkspace }>('/api/stock/issues', { method: 'POST', body: JSON.stringify({ lotId: selectedLot.id, quantity: Number(form.quantity), reference: form.reference, note: form.note, overrideReason: form.overrideReason, expiredConfirmed: expired }) })
      onSaved(result.stock)
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'บันทึกเบิก Stock ไม่สำเร็จ') } finally { setBusy(false) }
  }
  return <Modal title="เบิกออก" description="ระบบเลือก Lot ตาม FEFO ให้ก่อน สามารถเปลี่ยน Lot ได้พร้อมระบุเหตุผล" icon={<ArrowUpFromLine />} onClose={onClose}><form onSubmit={submit} className="space-y-3">
    <Field label="สินค้า"><Select required value={form.itemId} onChange={(event) => { const nextItem = eligibleItems.find((candidate) => candidate.id === event.target.value); const nextLots = nextItem?.lots.filter((lot) => lot.onHand > 0) ?? []; setForm({ ...form, itemId: event.target.value, lotId: getSuggestedStockLot(nextLots)?.id ?? nextLots[0]?.id ?? '', overrideReason: '' }) }}>{eligibleItems.map((option) => <option key={option.id} value={option.id}>{option.itemCode} · {option.name}</option>)}</Select></Field>
    <Field label="Lot"><Select required value={form.lotId} onChange={(event) => setForm({ ...form, lotId: event.target.value, overrideReason: '' })}>{lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.lotNumber} · {formatQuantity(lot.onHand)} {item?.unit}{lot.expiryDate ? ` · EXP ${formatDate(lot.expiryDate)}` : ''}{lot.id === suggestedLot?.id ? ' · FEFO แนะนำ' : ''}{lot.expiryState === 'expired' ? ' · หมดอายุ' : ''}</option>)}</Select></Field>
    {selectedLot?.expiryState === 'expired' ? <Notice tone="danger">Lot นี้หมดอายุแล้ว ระบบจะขอให้ยืนยันอีกครั้งก่อนบันทึก</Notice> : null}
    {overrideRequired ? <Field label="เหตุผลที่ไม่ใช้ Lot ตาม FEFO"><Textarea required rows={2} value={form.overrideReason} onChange={(event) => setForm({ ...form, overrideReason: event.target.value })} /></Field> : null}
    <div className="grid gap-3 sm:grid-cols-2"><Field label={`จำนวน${item ? ` (${item.unit})` : ''}`}><Input required type="number" min="0.001" max={selectedLot?.onHand} step="0.001" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></Field><Field label="Reference (ไม่บังคับ)"><Input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} /></Field></div>
    <Field label="หมายเหตุ (ไม่บังคับ)"><Textarea rows={2} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field>
    <ModalActions busy={busy} error={error} onClose={onClose} submitLabel="บันทึกเบิกออก" />
  </form></Modal>
}

function AdjustModal({ lot, item, onClose, onSaved }: { lot: StockLot; item: StockItem; onClose: () => void; onSaved: (stock: StockWorkspace) => void }) {
  const [form, setForm] = useState({ quantity: '', reference: '', note: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result = await api<{ stock: StockWorkspace }>('/api/stock/adjustments', { method: 'POST', body: JSON.stringify({ lotId: lot.id, quantity: Number(form.quantity), reference: form.reference, note: form.note }) })
      onSaved(result.stock)
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'ปรับยอดไม่สำเร็จ') } finally { setBusy(false) }
  }
  return <Modal title="ปรับยอด Stock" description={`${item.itemCode} · ${item.name} · Lot ${lot.lotNumber}`} icon={<Pencil />} onClose={onClose}><form onSubmit={submit} className="space-y-3">
    <Notice tone="warning">ใช้สำหรับผลต่างจากการตรวจนับเท่านั้น กรอกจำนวนเพิ่มเป็นบวก หรือลดเป็นลบ</Notice>
    <Field label={`จำนวนที่ปรับ (${item.unit})`}><Input required type="number" step="0.001" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></Field>
    <Field label="Reference (ไม่บังคับ)"><Input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} /></Field>
    <Field label="เหตุผล"><Textarea required rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field>
    <ModalActions busy={busy} error={error} onClose={onClose} submitLabel="บันทึกปรับยอด" />
  </form></Modal>
}

function MasterModal({ data, onClose, onSaved }: { data: StockWorkspace; onClose: () => void; onSaved: (stock: StockWorkspace, message: string) => void }) {
  const [tab, setTab] = useState<'items' | 'categories'>('items')
  const [itemForm, setItemForm] = useState({ id: '', itemCode: '', name: '', categoryId: data.categories.find((item) => item.isActive)?.id ?? '', unit: '', minimumStock: '0', trackLot: true, trackExpiry: true })
  const [categoryName, setCategoryName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  function resetItem() { setItemForm({ id: '', itemCode: '', name: '', categoryId: data.categories.find((item) => item.isActive)?.id ?? '', unit: '', minimumStock: '0', trackLot: true, trackExpiry: true }) }
  async function saveItem(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const body = { ...itemForm, minimumStock: Number(itemForm.minimumStock) }
      const result = await api<{ stock: StockWorkspace }>(itemForm.id ? `/api/stock/items/${itemForm.id}` : '/api/stock/items', { method: itemForm.id ? 'PATCH' : 'POST', body: JSON.stringify(body) })
      onSaved(result.stock, itemForm.id ? 'แก้ไขสินค้าแล้ว' : 'เพิ่มสินค้าแล้ว'); resetItem()
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'บันทึกสินค้าไม่สำเร็จ') } finally { setBusy(false) }
  }
  async function toggleItem(item: StockItem) {
    try { const result = await api<{ stock: StockWorkspace }>(`/api/stock/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !item.isActive }) }); onSaved(result.stock, 'เปลี่ยนสถานะสินค้าแล้ว') }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'เปลี่ยนสถานะไม่สำเร็จ') }
  }
  async function createCategory(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { const result = await api<{ stock: StockWorkspace }>('/api/stock/categories', { method: 'POST', body: JSON.stringify({ name: categoryName }) }); onSaved(result.stock, 'เพิ่มหมวดหมู่แล้ว'); setCategoryName('') }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'เพิ่มหมวดหมู่ไม่สำเร็จ') } finally { setBusy(false) }
  }
  async function renameCategory(category: StockCategory) {
    const name = window.prompt('ชื่อหมวดหมู่', category.name)
    if (!name?.trim() || name.trim() === category.name) return
    try { const result = await api<{ stock: StockWorkspace }>(`/api/stock/categories/${category.id}`, { method: 'PATCH', body: JSON.stringify({ name }) }); onSaved(result.stock, 'แก้ไขหมวดหมู่แล้ว') }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'แก้ไขหมวดหมู่ไม่สำเร็จ') }
  }
  async function toggleCategory(category: StockCategory) {
    try { const result = await api<{ stock: StockWorkspace }>(`/api/stock/categories/${category.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !category.isActive }) }); onSaved(result.stock, 'เปลี่ยนสถานะหมวดหมู่แล้ว') }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'เปลี่ยนสถานะไม่สำเร็จ') }
  }
  return <Modal wide title="Stock Master Data" description="Admin จัดการหมวดหมู่ สินค้า หน่วยนับ และเงื่อนไขการติดตาม Lot" icon={<Settings2 />} onClose={onClose}>
    <div className="mb-4 flex gap-1 rounded-lg border border-[#dbe7e8] bg-[#f8fbfb] p-1"><button type="button" onClick={() => setTab('items')} className={`rounded-md px-3 py-1.5 text-xs font-bold ${tab === 'items' ? 'bg-white text-[#087f79] shadow-sm' : 'text-[#789097]'}`}>สินค้า</button><button type="button" onClick={() => setTab('categories')} className={`rounded-md px-3 py-1.5 text-xs font-bold ${tab === 'categories' ? 'bg-white text-[#087f79] shadow-sm' : 'text-[#789097]'}`}>หมวดหมู่</button></div>
    {error ? <div className="mb-3"><Notice tone="danger">{error}</Notice></div> : null}
    {tab === 'items' ? <div className="grid gap-4 lg:grid-cols-[1fr_330px]"><div className="max-h-[500px] overflow-y-auto rounded-lg border border-[#dfe9ea]">{data.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b border-[#edf2f2] px-3 py-2.5 last:border-0"><div><p className="mono text-xs font-bold text-[#315763]">{item.itemCode}</p><p className="mt-0.5 text-sm font-semibold text-[#58727b]">{item.name}</p><p className="mt-0.5 text-[10px] text-[#91a3a7]">{item.categoryName} · {item.unit}</p></div><div className="flex gap-1"><Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => setItemForm({ id: item.id, itemCode: item.itemCode, name: item.name, categoryId: item.categoryId, unit: item.unit, minimumStock: String(item.minimumStock), trackLot: item.trackLot, trackExpiry: item.trackExpiry })}><Pencil className="size-3" /></Button><button type="button" onClick={() => toggleItem(item)} className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${item.isActive ? 'border-[#c7e0c8] bg-[#f0f8f1] text-[#518058]' : 'border-[#e0d7d8] bg-[#f7f4f4] text-[#8d7b7d]'}`}>{item.isActive ? 'ACTIVE' : 'INACTIVE'}</button></div></div>)}{!data.items.length ? <p className="px-3 py-8 text-center text-sm text-[#91a4a9]">ยังไม่มีสินค้า</p> : null}</div><form onSubmit={saveItem} className="space-y-2.5 rounded-lg border border-[#dfe9ea] bg-[#fbfdfd] p-3"><h3 className="font-bold text-[#173d50]">{itemForm.id ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'}</h3><Field label="Item code"><Input required value={itemForm.itemCode} onChange={(event) => setItemForm({ ...itemForm, itemCode: event.target.value })} /></Field><Field label="ชื่อสินค้า"><Input required value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} /></Field><Field label="หมวดหมู่"><Select required value={itemForm.categoryId} onChange={(event) => setItemForm({ ...itemForm, categoryId: event.target.value })}>{data.categories.filter((item) => item.isActive).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field><div className="grid grid-cols-2 gap-2"><Field label="หน่วยนับ"><Input required value={itemForm.unit} onChange={(event) => setItemForm({ ...itemForm, unit: event.target.value })} /></Field><Field label="Minimum"><Input required type="number" min="0" step="0.001" value={itemForm.minimumStock} onChange={(event) => setItemForm({ ...itemForm, minimumStock: event.target.value })} /></Field></div><label className="flex items-center gap-2 text-xs font-semibold text-[#58747d]"><input type="checkbox" checked={itemForm.trackLot} onChange={(event) => setItemForm({ ...itemForm, trackLot: event.target.checked, trackExpiry: event.target.checked ? itemForm.trackExpiry : false })} /> ติดตาม Lot</label><label className="flex items-center gap-2 text-xs font-semibold text-[#58747d]"><input type="checkbox" disabled={!itemForm.trackLot} checked={itemForm.trackExpiry} onChange={(event) => setItemForm({ ...itemForm, trackExpiry: event.target.checked })} /> ติดตาม Expiry</label><div className="flex justify-end gap-2 pt-2">{itemForm.id ? <Button type="button" variant="ghost" onClick={resetItem}>ยกเลิกแก้ไข</Button> : null}<Button disabled={busy || !data.categories.some((item) => item.isActive)}><Plus className="size-4" /> {itemForm.id ? 'บันทึก' : 'เพิ่มสินค้า'}</Button></div></form></div> : <div className="grid gap-4 lg:grid-cols-[1fr_330px]"><div className="max-h-[500px] overflow-y-auto rounded-lg border border-[#dfe9ea]">{data.categories.map((category) => <div key={category.id} className="flex items-center justify-between gap-3 border-b border-[#edf2f2] px-3 py-3 last:border-0"><p className="font-semibold text-[#58727b]">{category.name}</p><div className="flex gap-1"><Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => renameCategory(category)}><Pencil className="size-3" /></Button><button type="button" onClick={() => toggleCategory(category)} className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${category.isActive ? 'border-[#c7e0c8] bg-[#f0f8f1] text-[#518058]' : 'border-[#e0d7d8] bg-[#f7f4f4] text-[#8d7b7d]'}`}>{category.isActive ? 'ACTIVE' : 'INACTIVE'}</button></div></div>)}{!data.categories.length ? <p className="px-3 py-8 text-center text-sm text-[#91a4a9]">ยังไม่มีหมวดหมู่</p> : null}</div><form onSubmit={createCategory} className="space-y-3 rounded-lg border border-[#dfe9ea] bg-[#fbfdfd] p-3"><h3 className="font-bold text-[#173d50]">เพิ่มหมวดหมู่</h3><Field label="ชื่อหมวดหมู่"><Input required value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="เช่น Reagent, Kit" /></Field><div className="flex justify-end"><Button disabled={busy}><Plus className="size-4" /> เพิ่มหมวดหมู่</Button></div></form></div>}
  </Modal>
}

function Modal({ title, description, icon, onClose, children, wide = false }: { title: string; description: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#173d50]/32 px-4 py-8 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className={`paper max-h-full w-full overflow-y-auto rounded-xl p-5 ${wide ? 'max-w-5xl' : 'max-w-xl'}`}><div className="mb-4 flex items-start justify-between gap-3"><div className="flex gap-2.5"><span className="mt-0.5 text-[#087f79] [&>svg]:size-5">{icon}</span><div><h2 className="font-bold text-[#173d50]">{title}</h2><p className="mt-1 text-xs leading-5 text-[#80959b]">{description}</p></div></div><button type="button" onClick={onClose} aria-label="ปิด" className="rounded p-1 text-[#91a4a9] hover:bg-[#f0f5f5] hover:text-[#58727b]"><X className="size-4" /></button></div>{children}</div></div>
}

function ModalActions({ busy, error, onClose, submitLabel }: { busy: boolean; error: string; onClose: () => void; submitLabel: string }) {
  return <>{error ? <Notice tone="danger">{error}</Notice> : null}<div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={onClose}>ยกเลิก</Button><Button disabled={busy}>{busy ? 'กำลังบันทึก' : submitLabel}</Button></div></>
}

function StockKpi({ icon, label, value, tone = 'default' }: { icon: React.ReactNode; label: string; value: number; tone?: 'default' | 'amber' | 'danger' }) {
  const colors = tone === 'danger' ? 'text-[#be3d49] bg-[#fff1f2]' : tone === 'amber' ? 'text-[#b97416] bg-[#fff7e8]' : 'text-[#087f79] bg-[#edf9f7]'
  return <Card className="p-3.5 sm:p-4"><div className={`flex size-8 items-center justify-center rounded-lg [&>svg]:size-4 ${colors}`}>{icon}</div><p className="mt-4 text-[11px] font-bold text-[#789097]">{label}</p><p className={`mono mt-1 text-2xl font-bold ${tone === 'danger' ? 'text-[#be3d49]' : 'text-[#173d50]'}`}>{value}</p></Card>
}

function MiniStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="rounded-lg border border-[#dbe7e8] bg-white/80 px-3 py-2"><p className="text-[9px] font-bold tracking-[0.1em] text-[#91a3a7] uppercase">{label}</p><p className={`mono mt-1 text-xs font-bold ${accent ? 'text-[#be3d49]' : 'text-[#41616b]'}`}>{value}</p></div>
}

function ItemAlerts({ item }: { item: StockItem }) {
  const expired = item.lots.some((lot) => lot.onHand > 0 && lot.expiryState === 'expired')
  const expiring = item.lots.some((lot) => lot.onHand > 0 && lot.expiryState === 'expiring')
  return <div className="flex flex-wrap gap-1">{item.isLowStock ? <AlertBadge text="LOW" tone="danger" /> : null}{expired ? <AlertBadge text="EXPIRED" tone="danger" /> : null}{expiring ? <AlertBadge text="EXPIRING" tone="amber" /> : null}{!item.isLowStock && !expired && !expiring ? <AlertBadge text="OK" tone="teal" /> : null}</div>
}

function AlertBadge({ text, tone }: { text: string; tone: 'teal' | 'amber' | 'danger' }) {
  const style = tone === 'danger' ? 'border-[#efc7cc] bg-[#fff1f2] text-[#b13844]' : tone === 'amber' ? 'border-[#eed4a6] bg-[#fff7e8] text-[#a86814]' : 'border-[#bde3de] bg-[#edf9f7] text-[#087f79]'
  return <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold tracking-[0.05em] ${style}`}>{text}</span>
}

function ExpiryBadge({ state }: { state: StockLot['expiryState'] }) {
  if (state === 'expired') return <AlertBadge text="EXPIRED" tone="danger" />
  if (state === 'expiring') return <AlertBadge text="EXPIRING" tone="amber" />
  return null
}

function MovementBadge({ type }: { type: StockMovement['movementType'] }) {
  const styles = { receive: 'bg-[#eaf8f6] text-[#087f79]', issue: 'bg-[#fff1f2] text-[#b13844]', adjustment: 'bg-[#fff7e8] text-[#a86814]', reversal: 'bg-[#edf1f5] text-[#607687]' }
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold tracking-[0.06em] ${styles[type]}`}>{type.toUpperCase()}</span>
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(`${value}T00:00:00+07:00`))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
}
