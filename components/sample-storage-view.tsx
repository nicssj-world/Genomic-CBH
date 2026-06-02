'use client'

import { Fragment, useMemo, useState } from 'react'
import { Archive, CalendarClock, CheckCircle2, Clock3, FileDown, PackageOpen, Play, ShieldAlert, Trash2 } from 'lucide-react'
import { STORAGE_BOX_CAPACITY, getStorageDueState } from '@/lib/nipt/rules'
import type { SampleStorageData, StorageBox, StorageSlot } from '@/lib/nipt/types'
import { api, Button, Card, Input, Notice, PageHeader } from '@/components/ui'

const letters = [...'ABCDEFGHI']
const rows = Array.from({ length: 9 }, (_, index) => index + 1)

export function SampleStorageView({ initialData }: { initialData: SampleStorageData }) {
  const [data, setData] = useState(initialData)
  const [selectedBoxId, setSelectedBoxId] = useState(initialData.boxes.find((box) => box.status === 'filling')?.id ?? initialData.boxes[0]?.id ?? '')
  const [destroyedByName, setDestroyedByName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const selectedBox = data.boxes.find((box) => box.id === selectedBoxId) ?? data.boxes.find((box) => box.status === 'filling') ?? data.boxes[0] ?? null
  const activeBox = data.boxes.find((box) => box.status === 'filling') ?? null
  const dueBoxes = useMemo(() => data.boxes.filter((box) => {
    if (box.status !== 'full') return false
    return ['due', 'overdue'].includes(getStorageDueState(box.destroyDueDate).state)
  }), [data.boxes])

  function showError(requestError: unknown) {
    setError(requestError instanceof Error ? requestError.message : 'ดำเนินการไม่สำเร็จ')
  }

  async function autofill() {
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await api<{ detail: { assigned: number; boxes_created: number }; storage: SampleStorageData }>('/api/sample-storage', { method: 'POST' })
      setData(result.storage)
      setSelectedBoxId(result.storage.boxes.find((box) => box.status === 'filling')?.id ?? result.storage.boxes[0]?.id ?? '')
      setMessage(result.detail.assigned
        ? `จัดเก็บ ${result.detail.assigned} ตัวอย่างแล้ว${result.detail.boxes_created ? ` · เปิดกล่องใหม่ ${result.detail.boxes_created} กล่อง` : ''}`
        : 'ไม่มีตัวอย่างใหม่ที่รอจัดเก็บ')
    } catch (requestError) { showError(requestError) } finally { setBusy(false) }
  }

  async function destroyBox() {
    if (!selectedBox || !destroyedByName.trim()) return
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await api<{ storage: SampleStorageData }>(`/api/sample-storage/${selectedBox.id}/destroy`, {
        method: 'POST',
        body: JSON.stringify({ destroyedByName }),
      })
      setData(result.storage)
      setDestroyedByName('')
      setMessage(`บันทึกการทำลาย ${selectedBox.boxLabel} แล้ว`)
    } catch (requestError) { showError(requestError) } finally { setBusy(false) }
  }

  async function exportPdf() {
    if (!selectedBox) return
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch(`/api/sample-storage/${selectedBox.id}/export`)
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'Export PDF ไม่สำเร็จ')
      }
      const downloadUrl = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = downloadUrl
      anchor.download = `Sample-Storage_${selectedBox.boxLabel.replace('/', '-')}.pdf`
      anchor.click()
      URL.revokeObjectURL(downloadUrl)
      setMessage(`Export PDF ${selectedBox.boxLabel} แล้ว`)
    } catch (requestError) { showError(requestError) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <PageHeader
        eyebrow="Cold archive control"
        title="Sample Storage"
        description="จัดเก็บตัวอย่างคนไข้ลงกล่อง 9×9 แบบ FIFO และติดตามกำหนดทำลายหลังกล่องเต็มครบ 2 ปี"
        actions={<Button disabled={busy || data.queueCount === 0} onClick={autofill}><Play className="size-4" /> Auto-fill {data.queueCount ? `${data.queueCount} ตัวอย่าง` : 'คิวว่าง'}</Button>}
      />

      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {dueBoxes.length ? <Notice tone="danger">มีกล่องครบกำหนดทำลาย {dueBoxes.length} กล่อง: {dueBoxes.map((box) => box.boxLabel).join(', ')}</Notice> : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StorageKpi icon={<Clock3 />} label="รอจัดเก็บ" value={data.queueCount} tone="amber" />
        <StorageKpi icon={<PackageOpen />} label="กล่องที่กำลังเติม" value={activeBox ? `${occupiedSlots(activeBox)}/81` : '-'} tone="teal" />
        <StorageKpi icon={<Archive />} label="ตัวอย่างที่จัดเก็บ" value={data.storedCount} />
        <StorageKpi icon={<CalendarClock />} label="ใกล้กำหนด ≤ 90 วัน" value={data.dueSoonBoxCount} tone="amber" />
        <StorageKpi icon={<ShieldAlert />} label="ครบกำหนดทำลาย" value={data.dueBoxCount} tone="danger" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="border-b border-[#e0e9ea] px-4 py-3">
            <h2 className="font-bold text-[#173d50]">Storage boxes</h2>
            <p className="mt-0.5 text-xs text-[#83979d]">{data.boxes.length} กล่อง · เต็มแล้ว {data.fullBoxCount}</p>
          </div>
          <div className="max-h-[760px] space-y-1.5 overflow-y-auto p-2.5">
            {data.boxes.map((box) => <BoxSelector key={box.id} box={box} active={selectedBox?.id === box.id} onClick={() => setSelectedBoxId(box.id)} />)}
            {!data.boxes.length ? <p className="px-3 py-8 text-center text-sm leading-6 text-[#91a4a9]">ยังไม่มีกล่องจัดเก็บ<br />กด Auto-fill เมื่อมีตัวอย่างรับเข้า</p> : null}
          </div>
        </Card>

        {selectedBox ? <StorageBoxDetail box={selectedBox} busy={busy} destroyedByName={destroyedByName} onDestroyedByNameChange={setDestroyedByName} onDestroy={destroyBox} onExport={exportPdf} /> : <Card className="flex min-h-[520px] items-center justify-center p-8 text-center"><div><Archive className="mx-auto size-10 text-[#adc0c3]" /><p className="mt-3 text-sm text-[#82979d]">ยังไม่มีกล่องจัดเก็บตัวอย่าง</p></div></Card>}
      </div>
    </div>
  )
}

function StorageBoxDetail({ box, busy, destroyedByName, onDestroyedByNameChange, onDestroy, onExport }: { box: StorageBox; busy: boolean; destroyedByName: string; onDestroyedByNameChange: (value: string) => void; onDestroy: () => void; onExport: () => void }) {
  const occupied = occupiedSlots(box)
  const due = getStorageDueState(box.destroyDueDate)
  const canDestroy = box.status === 'full' && ['due', 'overdue'].includes(due.state)
  const slotMap = new Map(box.slots.map((slot) => [slot.slotNumber, slot]))

  return <div className="space-y-4">
    <Card className="overflow-hidden">
      <div className="border-b border-[#e0e9ea] bg-[linear-gradient(110deg,#fafdfe,#f1f9f8)] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-[11px] font-bold tracking-[0.16em] text-[#087f79] uppercase">9×9 cryo archive</p><h2 className="mono mt-1 text-2xl font-bold text-[#173d50]">{box.boxLabel}</h2><p className="mt-1 text-xs text-[#789097]">จัดเก็บแล้ว {occupied}/{STORAGE_BOX_CAPACITY} ช่อง</p></div>
          <div className="flex items-center gap-2"><Button variant="secondary" disabled={busy} onClick={onExport}><FileDown className="size-4" /> Export PDF</Button><BoxStatus box={box} /></div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#ddebea]"><div className="h-full rounded-full bg-[#087f79] transition-all" style={{ width: `${occupied / STORAGE_BOX_CAPACITY * 100}%` }} /></div>
      </div>

      <div className="grid gap-px border-b border-[#e0e9ea] bg-[#e0e9ea] sm:grid-cols-4">
        <Timeline label="เริ่มจัดเก็บ" value={formatDateTime(box.startedAt)} />
        <Timeline label="เต็มกล่องเมื่อ" value={box.filledAt ? formatDateTime(box.filledAt) : 'รอครบ 81 ช่อง'} />
        <Timeline label="กำหนดทำลาย" value={box.destroyDueDate ? formatDate(box.destroyDueDate) : 'เริ่มนับเมื่อเต็มกล่อง'} accent={due.state === 'due-soon' || due.state === 'due' || due.state === 'overdue'} />
        <Timeline label="สถานะการทำลาย" value={box.destroyedAt ? formatDateTime(box.destroyedAt) : countdownText(due.daysRemaining)} accent={due.state === 'due' || due.state === 'overdue'} />
      </div>

      <div className="overflow-x-auto p-3 sm:p-5">
        <div className="min-w-[780px] rounded-xl border border-[#d6e3e4] bg-[#f8fbfb] p-3">
          <div className="grid grid-cols-[26px_repeat(9,minmax(0,1fr))] gap-1.5">
            <div />
            {letters.map((letter) => <div key={letter} className="mono flex h-6 items-center justify-center text-[11px] font-bold text-[#718b92]">{letter}</div>)}
            {rows.map((row) => <Fragment key={row}>
              <div className="mono flex items-center justify-center text-[11px] font-bold text-[#718b92]">{row}</div>
              {letters.map((_, column) => {
                const slot = slotMap.get((row - 1) * 9 + column + 1)
                return <StorageCell key={slot?.id ?? `${row}-${column}`} slot={slot} />
              })}
            </Fragment>)}
          </div>
        </div>
      </div>
    </Card>

    <DestructionPanel box={box} dueState={due.state} canDestroy={canDestroy} busy={busy} destroyedByName={destroyedByName} onDestroyedByNameChange={onDestroyedByNameChange} onDestroy={onDestroy} />
  </div>
}

function StorageCell({ slot }: { slot?: StorageSlot }) {
  const sample = slot?.sample
  return <div title={sample ? `${slot.position} · LN ${sample.ln} · ${sample.lnHalos}` : slot?.position} className={`min-h-16 rounded-md border p-1.5 transition ${sample ? 'border-[#a9d7d2] bg-white shadow-sm' : 'border-[#dce7e8] bg-[#f2f6f6]'}`}>
    <p className="mono text-[9px] font-bold text-[#89a0a5]">{slot?.position}</p>
    <p className={`mono mt-2 whitespace-nowrap text-[8px] leading-tight font-bold tracking-[-0.06em] ${sample ? 'text-[#315d67]' : 'text-[#bdcacc]'}`}>{sample?.lnHalos ?? 'EMPTY'}</p>
    {sample ? <p className="mono mt-0.5 whitespace-nowrap text-[8px] leading-tight tracking-[-0.06em] text-[#8b9da2]">LN {sample.ln}</p> : null}
  </div>
}

function DestructionPanel({ box, dueState, canDestroy, busy, destroyedByName, onDestroyedByNameChange, onDestroy }: { box: StorageBox; dueState: ReturnType<typeof getStorageDueState>['state']; canDestroy: boolean; busy: boolean; destroyedByName: string; onDestroyedByNameChange: (value: string) => void; onDestroy: () => void }) {
  if (box.status === 'destroyed') return <Card className="border-[#c6e2ca] bg-[#f7fcf7] p-4"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-5 text-[#56815d]" /><div><h3 className="font-bold text-[#416c48]">ทำลายตัวอย่างแล้ว</h3><p className="mt-1 text-sm text-[#6f8c74]">ผู้ทำลาย: {box.destroyedByName} · บันทึกเมื่อ {formatDateTime(box.destroyedAt!)}</p>{box.destroyedRecordedByName ? <p className="mt-0.5 text-xs text-[#8aa08e]">ผู้บันทึกในระบบ: {box.destroyedRecordedByName}</p> : null}</div></div></Card>
  if (box.status === 'filling') return <Card className="p-4"><div className="flex items-start gap-3"><Clock3 className="mt-0.5 size-5 text-[#087f79]" /><div><h3 className="font-bold text-[#173d50]">กำลังจัดเก็บตัวอย่าง</h3><p className="mt-1 text-sm leading-6 text-[#718990]">ระบบจะเริ่มนับถอยหลัง 2 ปีอัตโนมัติ เมื่อกล่องนี้มีตัวอย่างครบ 81 ช่อง</p></div></div></Card>
  if (!canDestroy) return <Card className={`p-4 ${dueState === 'due-soon' ? 'border-[#eed4a6] bg-[#fffdf7]' : ''}`}><div className="flex items-start gap-3"><CalendarClock className="mt-0.5 size-5 text-[#c47b16]" /><div><h3 className="font-bold text-[#76501b]">รอวันครบกำหนดทำลาย</h3><p className="mt-1 text-sm text-[#937044]">กำหนดทำลาย {formatDate(box.destroyDueDate!)}</p></div></div></Card>

  return <Card className="border-[#efc7cc] bg-[#fffafa] p-4">
    <div className="flex items-start gap-3"><Trash2 className="mt-0.5 size-5 text-[#be3d49]" /><div><h3 className="font-bold text-[#a83541]">กล่องนี้ครบกำหนดทำลายแล้ว</h3><p className="mt-1 text-sm text-[#a66a71]">กรอกชื่อผู้ทำลาย เพื่อบันทึกประวัติการทำลายตัวอย่าง</p></div></div>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input aria-label="ชื่อผู้ทำลายตัวอย่าง" value={destroyedByName} onChange={(event) => onDestroyedByNameChange(event.target.value)} placeholder="ชื่อผู้ทำลายตัวอย่าง" /><Button variant="danger" disabled={busy || !destroyedByName.trim()} onClick={onDestroy}><Trash2 className="size-4" /> บันทึกการทำลาย</Button></div>
  </Card>
}

function BoxSelector({ box, active, onClick }: { box: StorageBox; active: boolean; onClick: () => void }) {
  const occupied = occupiedSlots(box)
  const due = getStorageDueState(box.destroyDueDate)
  return <button onClick={onClick} className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${active ? 'border-[#087f79] bg-[#eef9f7]' : 'border-transparent hover:border-[#dce7e8] hover:bg-[#f8fbfb]'}`}>
    <div className="flex items-center justify-between gap-2"><span className="mono text-xs font-bold text-[#315763]">{box.boxLabel}</span><span className={`size-2 rounded-full ${statusDot(box, due.state)}`} /></div>
    <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#85999e]"><span>{occupied}/81 ช่อง</span><span>{box.status === 'full' ? countdownText(due.daysRemaining) : box.status === 'destroyed' ? 'ทำลายแล้ว' : 'กำลังเติม'}</span></div>
  </button>
}

function BoxStatus({ box }: { box: StorageBox }) {
  const due = getStorageDueState(box.destroyDueDate)
  const style = box.status === 'destroyed' ? 'bg-[#edf8ee] text-[#56815d]' : due.state === 'due' || due.state === 'overdue' ? 'bg-[#fff0f1] text-[#b13844]' : due.state === 'due-soon' ? 'bg-[#fff7e8] text-[#a86814]' : box.status === 'full' ? 'bg-[#edf4f5] text-[#5b737c]' : 'bg-[#eaf8f6] text-[#087f79]'
  const label = box.status === 'destroyed' ? 'DESTROYED' : due.state === 'overdue' ? 'OVERDUE' : due.state === 'due' ? 'DUE TODAY' : due.state === 'due-soon' ? 'DUE SOON' : box.status.toUpperCase()
  return <span className={`self-start rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] ${style}`}>{label}</span>
}

function Timeline({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="bg-white px-4 py-3"><p className="text-[10px] font-bold tracking-[0.1em] text-[#83979d] uppercase">{label}</p><p className={`mt-1 text-xs font-semibold ${accent ? 'text-[#be3d49]' : 'text-[#486871]'}`}>{value}</p></div>
}

function StorageKpi({ icon, label, value, tone = 'default' }: { icon: React.ReactNode; label: string; value: number | string; tone?: 'default' | 'teal' | 'amber' | 'danger' }) {
  const colors = tone === 'danger' ? 'text-[#be3d49] bg-[#fff1f2]' : tone === 'amber' ? 'text-[#b97416] bg-[#fff7e8]' : tone === 'teal' ? 'text-[#087f79] bg-[#edf9f7]' : 'text-[#587984] bg-[#f0f5f5]'
  return <Card className="p-3.5 sm:p-4"><div className={`flex size-8 items-center justify-center rounded-lg [&>svg]:size-4 ${colors}`}>{icon}</div><p className="mt-4 text-[11px] font-bold text-[#789097]">{label}</p><p className={`mono mt-1 text-2xl font-bold ${tone === 'danger' ? 'text-[#be3d49]' : 'text-[#173d50]'}`}>{value}</p></Card>
}

function occupiedSlots(box: StorageBox) {
  return box.slots.filter((slot) => slot.sample).length
}

function countdownText(days: number | null) {
  if (days === null) return 'ยังไม่เริ่มนับ'
  if (days < 0) return `เกินกำหนด ${Math.abs(days)} วัน`
  if (days === 0) return 'ครบกำหนดวันนี้'
  return `เหลือ ${days} วัน`
}

function statusDot(box: StorageBox, dueState: ReturnType<typeof getStorageDueState>['state']) {
  if (box.status === 'destroyed') return 'bg-[#6e9b74]'
  if (dueState === 'due' || dueState === 'overdue') return 'bg-[#be3d49]'
  if (dueState === 'due-soon') return 'bg-[#d48a22]'
  if (box.status === 'full') return 'bg-[#77939a]'
  return 'bg-[#12a49d]'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(`${value}T00:00:00+07:00`))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
}
