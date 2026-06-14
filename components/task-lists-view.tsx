'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, ClipboardList, Eye, FileDown, FlaskConical, Lock, Play, Plus, Printer, RotateCcw, Save, Zap } from 'lucide-react'
import type { Actor, BatchDetail, SampleRow, TaskSheet } from '@/lib/nipt/types'
import { formatControlCode } from '@/lib/nipt/rules'
import { printTubeLabels } from '@/lib/nipt/label-print'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select } from '@/components/ui'

export function TaskListsView({ actor, initialBatch, initialSamples }: { actor: Actor; initialBatch: BatchDetail | null; initialSamples: SampleRow[] }) {
  const [batch, setBatch] = useState(initialBatch)
  const [samples] = useState(initialSamples)
  const [selectedSheet, setSelectedSheet] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [urgentRunId, setUrgentRunId] = useState('')
  const [runLabel, setRunLabel] = useState(initialBatch?.runLabel ?? '')

  const [showPrintModal, setShowPrintModal] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const assignedIds = useMemo(() => new Set(batch?.slots.map((slot) => slot.sampleRunId).filter(Boolean)), [batch])
  const queue = useMemo(() => samples.filter((sample) => sample.stage === 'Received' && !assignedIds.has(sample.runId)), [assignedIds, samples])
  const sheet = batch?.sheets.find((item) => item.sheetNumber === selectedSheet) ?? null
  const slots = batch?.slots.filter((item) => item.sheetNumber === selectedSheet) ?? []
  const sheetPatients = useMemo(() => slots.filter((s) => s.sample && !s.controlType).map((s) => s.sample!), [slots])

  function showError(requestError: unknown) {
    setError(requestError instanceof Error ? requestError.message : 'ดำเนินการไม่สำเร็จ')
  }

  async function create() {
    setBusy(true); setError('')
    try {
      const result = await api<{ batch: BatchDetail }>('/api/batches/current', { method: 'POST' })
      setBatch(result.batch); setRunLabel(result.batch.runLabel); setMessage('สร้าง extraction batch แล้ว')
    } catch (requestError) { showError(requestError) } finally { setBusy(false) }
  }

  async function autofill() {
    if (!batch) return
    setBusy(true); setError('')
    try {
      const result = await api<{ sheet: number; assigned: number; batch: BatchDetail }>(`/api/batches/${batch.id}/autofill`, { method: 'POST' })
      setBatch(result.batch); setSelectedSheet(result.sheet); setMessage(`เติม Task List ${result.sheet} แล้ว ${result.assigned} ตัวอย่าง`)
    } catch (requestError) { showError(requestError) } finally { setBusy(false) }
  }

  async function urgent() {
    if (!batch || !urgentRunId) return
    setBusy(true); setError('')
    try {
      const result = await api<{ sheet: number; slot: number; batch: BatchDetail }>(`/api/batches/${batch.id}/urgent`, { method: 'POST', body: JSON.stringify({ runId: urgentRunId }) })
      setBatch(result.batch); setSelectedSheet(result.sheet); setUrgentRunId(''); setMessage(`แทรกงานเร่งด่วนที่ slot ${result.slot} แล้ว`)
    } catch (requestError) { showError(requestError) } finally { setBusy(false) }
  }

  async function saveMetadata(values: SheetForm) {
    if (!batch) return
    setBusy(true); setError('')
    try {
      const result = await api<{ batch: BatchDetail }>(`/api/batches/${batch.id}/sheets/${selectedSheet}`, { method: 'PATCH', body: JSON.stringify(values) })
      setBatch(result.batch); setMessage(`บันทึก metadata ของ Task List ${selectedSheet} แล้ว`)
    } catch (requestError) { showError(requestError) } finally { setBusy(false) }
  }

  async function finalize() {
    if (!batch) return
    setBusy(true); setError('')
    try {
      const result = await api<{ batch: BatchDetail }>(`/api/batches/${batch.id}/sheets/${selectedSheet}/finalize`, { method: 'POST' })
      setBatch(result.batch); setMessage(`Finalize Task List ${selectedSheet} แล้ว`)
    } catch (requestError) { showError(requestError) } finally { setBusy(false) }
  }

  async function unlock() {
    if (!batch) return
    const reason = window.prompt('กรุณาระบุเหตุผลที่ปลดล็อก Task List')
    if (!reason) return
    setBusy(true); setError('')
    try {
      const result = await api<{ batch: BatchDetail }>(`/api/batches/${batch.id}/sheets/${selectedSheet}/unlock`, { method: 'POST', body: JSON.stringify({ reason }) })
      setBatch(result.batch); setMessage(`ปลดล็อก Task List ${selectedSheet} และสร้าง revision ใหม่แล้ว`)
    } catch (requestError) { showError(requestError) } finally { setBusy(false) }
  }

  async function saveRunLabel() {
    if (!batch) return
    setBusy(true); setError('')
    try {
      const result = await api<{ batch: BatchDetail }>(`/api/batches/${batch.id}`, { method: 'PATCH', body: JSON.stringify({ runLabel }) })
      setBatch(result.batch); setMessage('บันทึก Run label แล้ว')
    } catch (requestError) { showError(requestError) } finally { setBusy(false) }
  }

  async function exportPdf() {
    if (!batch || !sheet) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/batches/${batch.id}/sheets/${selectedSheet}/export`)
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'Export PDF ไม่สำเร็จ')
      }
      const downloadUrl = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = downloadUrl
      anchor.download = `Ext-Prep-Task-List-${selectedSheet}_${batch.runLabel.replace('/', '-')}.pdf`
      anchor.click()
      URL.revokeObjectURL(downloadUrl)
      setMessage(`Export PDF Task List ${selectedSheet} แล้ว`)
    } catch (requestError) { showError(requestError) } finally { setBusy(false) }
  }

  async function previewPdf() {
    if (!batch || !sheet) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/batches/${batch.id}/sheets/${selectedSheet}/export`)
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'Preview PDF ไม่สำเร็จ')
      }
      const url = URL.createObjectURL(await response.blob())
      setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url })
    } catch (requestError) { showError(requestError) } finally { setBusy(false) }
  }

  function closePreview() {
    setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null })
  }

  if (!batch) {
    return <div className="mx-auto max-w-[1500px] space-y-5"><PageHeader eyebrow="Extraction workspace" title="Ext. & Prep. Task Lists" description="จัด 45 patient samples และ 3 controls ต่อ sequencing batch" /><Card className="flex min-h-80 flex-col items-center justify-center p-8 text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-[#eaf7f5] text-[#087f79]"><FlaskConical className="size-7" /></span><h2 className="mt-4 text-xl font-bold text-[#173d50]">ยังไม่มี extraction batch ที่กำลังจัด</h2><p className="mt-2 max-w-md text-sm leading-6 text-[#7c9298]">เริ่ม batch ใหม่เพื่อสร้าง Task List 1-3 และ plate 48 ตำแหน่งพร้อม controls อัตโนมัติ</p><Button disabled={busy} onClick={create} className="mt-5"><Plus className="size-4" /> สร้าง Batch ใหม่</Button>{error ? <div className="mt-4"><Notice tone="danger">{error}</Notice></div> : null}</Card></div>
  }

  const patientCount = batch.slots.filter((slot) => slot.sampleRunId).length
  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <PageHeader eyebrow="Extraction workspace" title="Ext. & Prep. Task Lists" description="Auto-fill ทีละใบงาน, แทรกงานเร่งด่วน และ export เอกสาร A4 ตาม batch" actions={<Button disabled={busy} onClick={autofill}><Play className="size-4" /> Auto-fill ใบถัดไป</Button>} />
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="text-[11px] font-bold tracking-[0.15em] text-[#087f79] uppercase">Active batch</p><div className="mt-1 flex items-center gap-2"><span className="mono text-xl font-bold text-[#173d50]">{batch.runLabel}</span><span className="rounded-full border border-[#bde0dc] bg-[#eff9f8] px-2 py-0.5 text-[10px] font-bold text-[#087f79]">{batch.status}</span></div></div>
              <div className="sm:w-64"><div className="flex justify-between text-xs font-bold text-[#648088]"><span>Patient slots</span><span>{patientCount}/45</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e3eded]"><div className="h-full rounded-full bg-[#087f79]" style={{ width: `${patientCount / 45 * 100}%` }} /></div></div>
            </div>
            {actor.role === 'Admin' ? <div className="mt-4 flex max-w-sm gap-2"><Input value={runLabel} onChange={(event) => setRunLabel(event.target.value)} /><Button variant="secondary" onClick={saveRunLabel} disabled={busy}><Save className="size-4" /> Run label</Button></div> : null}
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap gap-2 border-b border-[#e0e9ea] px-4 py-3">
              {batch.sheets.map((item) => {
                const filled = batch.slots.filter((slot) => slot.sheetNumber === item.sheetNumber && slot.sampleRunId).length
                return <button key={item.id} onClick={() => setSelectedSheet(item.sheetNumber)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${selectedSheet === item.sheetNumber ? 'border-[#087f79] bg-[#eef9f7]' : 'border-[#dce7e8] bg-white hover:bg-[#f8fbfb]'}`}><span className={`flex size-6 items-center justify-center rounded-md text-xs font-bold ${item.finalizedAt ? 'bg-[#4e8657] text-white' : 'bg-[#e8f0f0] text-[#5e7981]'}`}>{item.finalizedAt ? <CheckCircle2 className="size-4" /> : item.sheetNumber}</span><span><span className="block text-xs font-bold text-[#345863]">Task List {item.sheetNumber}</span><span className="block text-[10px] text-[#879ba0]">{filled}/15 patients · Rev {item.revisionNumber}</span></span></button>
              })}
            </div>
            <div className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold text-[#173d50]">Plate positions 1-48</h2><p className="mt-0.5 text-xs text-[#83989e]">กำลังดู Task List {selectedSheet} · ตำแหน่ง {slots[0]?.slotNumber}-{slots.at(-1)?.slotNumber}</p></div><div className="flex gap-2"><Button variant="secondary" onClick={() => setShowPrintModal(true)} disabled={sheetPatients.length === 0}><Printer className="size-4" /> Print Labels</Button><Button variant="secondary" onClick={exportPdf} disabled={busy}><FileDown className="size-4" /> Export PDF</Button>{sheet?.finalizedAt ? actor.role === 'Admin' ? <Button variant="danger" onClick={unlock} disabled={busy}><RotateCcw className="size-4" /> Unlock</Button> : null : <Button onClick={finalize} disabled={busy}><Lock className="size-4" /> Finalize</Button>}</div></div>
              <PlateGrid batch={batch} selectedSheet={selectedSheet} onPrint={(s) => printTubeLabels([s])} />
              {showPrintModal && <PrintModal patients={sheetPatients} taskList={selectedSheet} onClose={() => setShowPrintModal(false)} />}
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          {sheet ? <SheetMetadata key={`${sheet.id}-${sheet.revisionNumber}`} sheet={sheet} disabled={Boolean(sheet.finalizedAt)} busy={busy} onSave={saveMetadata} onPreview={previewPdf} /> : null}
          <Card className="p-4">
            <div className="flex items-center gap-2"><Zap className="size-4 text-[#c47b16]" /><h3 className="text-sm font-bold text-[#173d50]">Urgent fill</h3></div>
            <p className="mt-1 text-xs leading-5 text-[#85999e]">เลือก LN Halos เพื่อแทรกลง patient slot ถัดไปของใบงานที่กำลังเติม</p>
            <Select className="mt-3" value={urgentRunId} onChange={(event) => setUrgentRunId(event.target.value)}>
              <option value="">เลือกตัวอย่าง · {queue.length} ในคิว</option>
              {queue.map((sample) => <option key={sample.runId} value={sample.runId}>{sample.runSampleId} · LN {sample.ln}</option>)}
            </Select>
            <Button disabled={busy || !urgentRunId} onClick={urgent} variant="secondary" className="mt-2 w-full"><Zap className="size-4" /> เติมงานเร่งด่วน</Button>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2"><ClipboardList className="size-4 text-[#087f79]" /><h3 className="text-sm font-bold text-[#173d50]">Fixed controls</h3></div>
            <div className="mt-3 space-y-2 text-xs">
              <ControlLine label="Positive Control" slot="01" code={formatControlCode('positive', sheet?.workDate ?? '')} />
              <ControlLine label="Negative Control" slot="25" code={formatControlCode('negative', batch.sheets[1]?.workDate ?? '')} />
              <ControlLine label="Blank Control" slot="40" code={formatControlCode('blank', batch.sheets[2]?.workDate ?? '')} />
            </div>
          </Card>
        </div>
      </div>
      {previewUrl && <PreviewModal url={previewUrl} onClose={closePreview} />}
    </div>
  )
}

function PreviewModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e0e9ea] px-5 py-4">
          <h2 className="text-sm font-bold text-[#173d50]">Preview เอกสาร Task List</h2>
          <div className="flex items-center gap-3">
            <a href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-[#dce7e8] px-3 py-1.5 text-xs font-bold text-[#345863] transition hover:bg-[#f5f9f9]">เปิดแท็บใหม่</a>
            <button onClick={onClose} className="text-[#aabec3] transition hover:text-[#5e7981]">✕</button>
          </div>
        </div>
        <iframe src={url} title="Task List preview" className="w-full flex-1 border-0" />
      </div>
    </div>
  )
}

function PlateGrid({ batch, selectedSheet, onPrint }: { batch: BatchDetail; selectedSheet: number; onPrint: (sample: SampleRow) => void }) {
  return <div className="rounded-xl border border-[#dbe7e8] bg-[#f8fbfb] p-3">
    <div className="grid grid-cols-8 gap-1.5">{batch.slots.map((slot) => {
      const current = slot.sheetNumber === selectedSheet
      const control = Boolean(slot.controlType)
      return <div key={slot.id} className={`min-h-18 rounded-lg border p-2 transition ${current ? control ? 'border-[#e4c180] bg-[#fff8e9]' : slot.sample ? 'border-[#aad7d2] bg-white shadow-sm' : 'border-[#d4e1e2] bg-white' : 'border-[#e2ebec] bg-[#f2f6f6] opacity-45'}`}>
        <div className="flex items-center justify-between gap-1"><span className="mono text-[10px] font-bold text-[#789097]">{String(slot.slotNumber).padStart(2, '0')}</span><span className="mono text-[10px] font-bold text-[#087f79]">{slot.platePosition}</span></div>
        <p className={`mono mt-2 whitespace-nowrap text-[8px] leading-tight font-bold tracking-[-0.06em] ${control ? 'text-[#a66a15]' : slot.sample ? 'text-[#355d67]' : 'text-[#b3c1c4]'}`}>{control ? `${slot.controlType} ctrl` : slot.sample?.runSampleId ?? 'EMPTY'}</p>
        {current && !control && slot.sample ? <button onClick={() => onPrint(slot.sample!)} title={`พิมพ์ label: ${slot.sample.lnHalos}`} className="mt-1.5 flex w-full items-center justify-center rounded py-0.5 text-[#087f79] transition hover:bg-[#daf0ee]"><Printer className="size-2.5" /></button> : null}
      </div>
    })}</div>
  </div>
}

type SheetForm = {
  workDate: string | null
  operatorText: string | null
  extractionLot: string | null
  extractionExpiry: string | null
  libraryLot: string | null
  libraryExpiry: string | null
}

function SheetMetadata({ sheet, disabled, busy, onSave, onPreview }: { sheet: TaskSheet; disabled: boolean; busy: boolean; onSave: (values: SheetForm) => void; onPreview: () => void }) {
  const [form, setForm] = useState<SheetForm>({ workDate: sheet.workDate, operatorText: sheet.operatorText, extractionLot: sheet.extractionLot, extractionExpiry: sheet.extractionExpiry, libraryLot: sheet.libraryLot, libraryExpiry: sheet.libraryExpiry })
  const update = (key: keyof SheetForm, value: string) => setForm((current) => ({ ...current, [key]: value || null }))
  return <Card className="p-4">
    <div className="flex items-center justify-between"><div className="flex items-center gap-2"><CalendarDays className="size-4 text-[#087f79]" /><h3 className="text-sm font-bold text-[#173d50]">Task List {sheet.sheetNumber} metadata</h3></div>{disabled ? <span className="rounded bg-[#eef7ef] px-1.5 py-0.5 text-[10px] font-bold text-[#57815c]">LOCKED</span> : null}</div>
    <div className="mt-3 space-y-2.5">
      <Field label="Work date"><Input disabled={disabled} type="date" value={form.workDate ?? ''} onChange={(event) => update('workDate', event.target.value)} /></Field>
      <Field label="Operator"><Input disabled={disabled} value={form.operatorText ?? ''} onChange={(event) => update('operatorText', event.target.value)} placeholder="ชื่อผู้ปฏิบัติงาน" /></Field>
      <div className="grid grid-cols-2 gap-2"><Field label="Extraction lot"><Input disabled={disabled} value={form.extractionLot ?? ''} onChange={(event) => update('extractionLot', event.target.value)} /></Field><Field label="Expiry"><Input disabled={disabled} type="date" value={form.extractionExpiry ?? ''} onChange={(event) => update('extractionExpiry', event.target.value)} /></Field></div>
      <div className="grid grid-cols-2 gap-2"><Field label="Library lot"><Input disabled={disabled} value={form.libraryLot ?? ''} onChange={(event) => update('libraryLot', event.target.value)} /></Field><Field label="Expiry"><Input disabled={disabled} type="date" value={form.libraryExpiry ?? ''} onChange={(event) => update('libraryExpiry', event.target.value)} /></Field></div>
    </div>
    <Button disabled={disabled || busy} onClick={() => onSave(form)} variant="secondary" className="mt-3 w-full"><Save className="size-4" /> บันทึก metadata</Button>
    <Button disabled={busy} onClick={onPreview} className="mt-2 w-full"><Eye className="size-4" /> Preview เอกสาร</Button>
  </Card>
}

function ControlLine({ label, slot, code }: { label: string; slot: string; code: string }) {
  return <div className="flex items-center justify-between gap-2 border-b border-[#edf2f2] pb-2"><div><p className="font-bold text-[#6c7d82]">{label}</p><p className="text-[10px] text-[#a2b0b3]">Slot {slot}</p></div><span className="mono text-[10px] font-bold text-[#a66a15]">{code || 'รอ Work date'}</span></div>
}

function PrintModal({ patients, taskList, onClose }: { patients: SampleRow[]; taskList: number; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(patients.map((p) => p.runId)))
  const allSelected = selected.size === patients.length
  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  function handlePrint() {
    const toPrint = patients.filter((p) => selected.has(p.runId))
    if (toPrint.length > 0) printTubeLabels(toPrint)
    onClose()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e0e9ea] px-5 py-4">
          <h2 className="text-sm font-bold text-[#173d50]">Print Labels — Task List {taskList}</h2>
          <button onClick={onClose} className="text-[#aabec3] transition hover:text-[#5e7981]">✕</button>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 border-b border-[#e0e9ea] px-5 py-3 text-sm font-bold text-[#345863]">
          <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(patients.map((p) => p.runId)))} className="size-4" />
          ทั้งหมด ({patients.length} ตัวอย่าง)
        </label>
        <div className="max-h-72 overflow-y-auto px-3 py-2">
          {patients.map((p) => (
            <label key={p.runId} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-[#f5f9f9]">
              <input type="checkbox" checked={selected.has(p.runId)} onChange={() => toggle(p.runId)} className="size-4" />
              <div className="min-w-0 flex-1">
                <p className="mono text-xs font-bold text-[#355d67]">{p.runSampleId}</p>
                <p className="truncate text-[11px] text-[#7c9298]">{p.patientName ?? '—'}</p>
              </div>
              <span className="shrink-0 rounded border border-[#e4c180] bg-[#fff8e9] px-1.5 py-0.5 text-[10px] text-[#a66a15]">{p.runType}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e0e9ea] px-5 py-4">
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={handlePrint} disabled={selected.size === 0}><Printer className="size-4" /> Print {selected.size > 0 ? `${selected.size} ตัวอย่าง` : ''}</Button>
        </div>
      </div>
    </div>
  )
}
