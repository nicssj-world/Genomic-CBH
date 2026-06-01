'use client'

import { useRef, useState } from 'react'
import { AlertCircle, FileDown, FileSpreadsheet, FlaskConical, Microscope, Save, UploadCloud } from 'lucide-react'
import type { QcImport, QcMeasurement, QcSheet, QcWorkspace } from '@/lib/nipt/types'
import { api, Button, Card, Field, Input, Notice, PageHeader } from '@/components/ui'

export function QcMeasurementsView({ initialWorkspace }: { initialWorkspace: QcWorkspace }) {
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [selectedSheetId, setSelectedSheetId] = useState(initialWorkspace.sheets[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const sheet = workspace.sheets.find((item) => item.id === selectedSheetId) ?? workspace.sheets[0] ?? null

  function replaceSheet(updated: QcSheet) {
    setWorkspace((current) => ({ sheets: current.sheets.map((item) => item.id === updated.id ? updated : item) }))
  }

  function showError(requestError: unknown) {
    setError(requestError instanceof Error ? requestError.message : 'ดำเนินการไม่สำเร็จ')
  }

  async function save(input: { workDate: string | null; operatorText: string | null; measurements: Array<{ slotNumber: number; concentration: number | null }> }) {
    if (!sheet) return
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await api<{ sheet: QcSheet }>(`/api/qc-measurements/${sheet.id}`, { method: 'PATCH', body: JSON.stringify(input) })
      replaceSheet(result.sheet)
      setMessage(`บันทึก QC measurements ของ ${result.sheet.runLabel} แล้ว`)
    } catch (requestError) { showError(requestError) } finally { setBusy(false) }
  }

  async function exportPdf() {
    if (!sheet) return
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch(`/api/qc-measurements/${sheet.id}/export`)
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? 'Export QC measurements ไม่สำเร็จ')
      }
      const downloadUrl = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = downloadUrl
      anchor.download = `QC-measurements_${sheet.runLabel.replace('/', '-')}.pdf`
      anchor.click()
      URL.revokeObjectURL(downloadUrl)
      setMessage(`Export PDF QC measurements ของ ${sheet.runLabel} แล้ว`)
    } catch (requestError) { showError(requestError) } finally { setBusy(false) }
  }

  async function uploadQubit(file: File) {
    if (!sheet) return
    setBusy(true); setError(''); setMessage('')
    try {
      const prepared = await api<{ key: string; uploadUrl: string }>(`/api/qc-measurements/${sheet.id}/imports/prepare`, {
        method: 'POST',
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type }),
      })
      const uploaded = await fetch(prepared.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } })
      if (!uploaded.ok) throw new Error('บันทึกไฟล์ Qubit ลงพื้นที่จัดเก็บไม่สำเร็จ')
      const result = await api<{ sheet: QcSheet }>(`/api/qc-measurements/${sheet.id}/imports`, {
        method: 'POST',
        body: JSON.stringify({ key: prepared.key, fileName: file.name, fileSize: file.size, mimeType: file.type || 'application/octet-stream' }),
      })
      replaceSheet(result.sheet)
      setMessage(`รับไฟล์ ${file.name} แล้ว · รอ mapping โครงสร้าง Qubit`)
    } catch (requestError) { showError(requestError) } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return <div className="mx-auto max-w-[1600px] space-y-5">
    <PageHeader
      eyebrow="Library quality checkpoint"
      title="QC Measurements"
      description="บันทึก DNA concentration ของ plate 48 ตำแหน่งหลัง Ext. & Prep. Task Lists ครบทั้ง 3 ใบ และ export ด้วยชีทต้นฉบับ"
      actions={sheet ? <Button disabled={busy || !sheet.ready} onClick={exportPdf}><FileDown className="size-4" /> Export PDF</Button> : null}
    />

    {message ? <Notice tone="success">{message}</Notice> : null}
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {sheet && !sheet.ready ? <Notice tone="warning">Task List ของ batch นี้ถูกปลดล็อก กรุณา finalize ให้ครบทั้ง 3 ใบก่อนแก้ไขหรือ export QC measurements</Notice> : null}

    {!sheet ? <EmptyState /> : <div className="grid gap-4 xl:grid-cols-[270px_minmax(0,1fr)_310px]">
      <BatchRail sheets={workspace.sheets} selectedSheetId={sheet.id} onSelect={setSelectedSheetId} />
      <QcEditor key={sheet.id} sheet={sheet} busy={busy} onSave={save} />
      <QubitImports sheet={sheet} busy={busy} fileRef={fileRef} onUpload={uploadQubit} />
    </div>}
  </div>
}

function BatchRail({ sheets, selectedSheetId, onSelect }: { sheets: QcSheet[]; selectedSheetId: string; onSelect: (id: string) => void }) {
  return <Card className="h-fit overflow-hidden">
    <div className="border-b border-[#e0e9ea] px-4 py-3">
      <h2 className="font-bold text-[#173d50]">QC batches</h2>
      <p className="mt-0.5 text-xs text-[#83979d]">{sheets.length} batches พร้อมบันทึก</p>
    </div>
    <div className="space-y-1.5 p-2.5">
      {sheets.map((sheet) => {
        const complete = sheet.measurements.filter((measurement) => measurement.concentration !== null).length
        const active = sheet.id === selectedSheetId
        return <button key={sheet.id} onClick={() => onSelect(sheet.id)} className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${active ? 'border-[#087f79] bg-[#eef9f7]' : 'border-transparent hover:border-[#dce7e8] hover:bg-[#f8fbfb]'}`}>
          <div className="flex items-center justify-between gap-2"><span className="mono text-xs font-bold text-[#315763]">{sheet.runLabel}</span><span className={`size-2 rounded-full ${sheet.ready ? complete === 48 ? 'bg-[#6e9b74]' : 'bg-[#12a49d]' : 'bg-[#d48a22]'}`} /></div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#85999e]"><span>{complete}/48 values</span><span>{sheet.ready ? 'READY' : 'LOCKED'}</span></div>
        </button>
      })}
    </div>
  </Card>
}

function QcEditor({ sheet, busy, onSave }: { sheet: QcSheet; busy: boolean; onSave: (input: { workDate: string | null; operatorText: string | null; measurements: Array<{ slotNumber: number; concentration: number | null }> }) => void }) {
  const [workDate, setWorkDate] = useState(sheet.workDate ?? '')
  const [operatorText, setOperatorText] = useState(sheet.operatorText ?? '')
  const [values, setValues] = useState<Record<number, string>>(() => Object.fromEntries(sheet.measurements.map((measurement) => [measurement.slotNumber, measurement.concentration?.toString() ?? ''])))
  const complete = Object.values(values).filter((value) => value !== '').length

  function save() {
    onSave({
      workDate: workDate || null,
      operatorText: operatorText.trim() || null,
      measurements: sheet.measurements.map((measurement) => ({
        slotNumber: measurement.slotNumber,
        concentration: values[measurement.slotNumber] === '' ? null : Number(values[measurement.slotNumber]),
      })),
    })
  }

  return <div className="space-y-4">
    <Card className="overflow-hidden">
      <div className="border-b border-[#dbe8e8] bg-[linear-gradient(110deg,#fafdfe,#edf8f6)] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-[11px] font-bold tracking-[0.16em] text-[#087f79] uppercase">DNA concentration plate</p><h2 className="mono mt-1 text-2xl font-bold text-[#173d50]">{sheet.runLabel}</h2><p className="mt-1 text-xs text-[#789097]">ข้อมูลเรียงต่อจาก Ext. & Prep. Task Lists 1-3 รวม controls</p></div>
          <span className={`self-start rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] ${complete === 48 ? 'bg-[#edf8ee] text-[#56815d]' : 'bg-[#eaf8f6] text-[#087f79]'}`}>{complete === 48 ? 'COMPLETE' : `${complete}/48 RECORDED`}</span>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#dcebea]"><div className="h-full rounded-full bg-[#087f79] transition-all" style={{ width: `${complete / 48 * 100}%` }} /></div>
      </div>

      <div className="grid gap-3 border-b border-[#e0e9ea] bg-white px-4 py-4 sm:grid-cols-2 sm:px-5">
        <Field label="ว/ด/ป ที่ปฏิบัติงาน"><Input disabled={busy || !sheet.ready} type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} /></Field>
        <Field label="ผู้ปฏิบัติงาน"><Input disabled={busy || !sheet.ready} value={operatorText} onChange={(event) => setOperatorText(event.target.value)} placeholder="ชื่อผู้ปฏิบัติงาน" /></Field>
      </div>

      <div className="space-y-4 p-3 sm:p-5">
        {[1, 2, 3].map((taskList) => <MeasurementGroup key={taskList} taskList={taskList} measurements={sheet.measurements.slice((taskList - 1) * 16, taskList * 16)} values={values} disabled={busy || !sheet.ready} onChange={(slot, value) => setValues((current) => ({ ...current, [slot]: value }))} />)}
      </div>

      <div className="flex flex-col gap-3 border-t border-[#e0e9ea] bg-[#fbfdfd] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-xs text-[#80959b]">หน่วย Concentration: <span className="font-bold text-[#55757d]">ng/ul</span></p>
        <Button disabled={busy || !sheet.ready} onClick={save}><Save className="size-4" /> บันทึก QC measurements</Button>
      </div>
    </Card>
  </div>
}

function MeasurementGroup({ taskList, measurements, values, disabled, onChange }: { taskList: number; measurements: QcMeasurement[]; values: Record<number, string>; disabled: boolean; onChange: (slot: number, value: string) => void }) {
  return <section>
    <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-md bg-[#eaf7f5] text-[11px] font-bold text-[#087f79]">{taskList}</span><h3 className="text-sm font-bold text-[#315763]">Ext. & Prep. Task List {taskList}</h3></div><span className="mono text-[10px] text-[#8ca0a5]">slots {measurements[0]?.slotNumber}-{measurements.at(-1)?.slotNumber}</span></div>
    <div className="overflow-hidden rounded-lg border border-[#dbe7e8]">
      {measurements.map((measurement) => <MeasurementRow key={measurement.id} measurement={measurement} value={values[measurement.slotNumber] ?? ''} disabled={disabled} onChange={onChange} />)}
    </div>
  </section>
}

function MeasurementRow({ measurement, value, disabled, onChange }: { measurement: QcMeasurement; value: string; disabled: boolean; onChange: (slot: number, value: string) => void }) {
  const isControl = Boolean(measurement.controlType)
  return <div className={`grid grid-cols-[48px_minmax(0,1fr)_132px] items-center gap-2 border-b border-[#edf2f2] px-2.5 py-1.5 last:border-b-0 ${isControl ? 'bg-[#fffaf0]' : 'bg-white'}`}>
    <span className={`mono text-[11px] font-bold ${isControl ? 'text-[#b57617]' : 'text-[#82979d]'}`}>{String(measurement.slotNumber).padStart(2, '0')}</span>
    <div className="min-w-0"><p className={`mono truncate text-[11px] font-bold ${isControl ? 'text-[#a66a15]' : 'text-[#486871]'}`}>{measurement.printedSampleId}</p>{isControl ? <p className="mt-0.5 text-[9px] font-bold tracking-[0.08em] text-[#c18b3d] uppercase">{measurement.controlType} control</p> : null}</div>
    <Input aria-label={`Concentration slot ${measurement.slotNumber}`} disabled={disabled} min="0" max="100000" step="0.01" type="number" value={value} onChange={(event) => onChange(measurement.slotNumber, event.target.value)} className="mono py-1.5 text-right text-xs" placeholder="0.00" />
  </div>
}

function QubitImports({ sheet, busy, fileRef, onUpload }: { sheet: QcSheet; busy: boolean; fileRef: React.RefObject<HTMLInputElement | null>; onUpload: (file: File) => void }) {
  return <div className="space-y-4">
    <Card className="border-dashed p-4">
      <div className="flex size-10 items-center justify-center rounded-xl bg-[#edf8f6] text-[#087f79]"><UploadCloud className="size-5" /></div>
      <h2 className="mt-3 font-bold text-[#173d50]">Import from Qubit</h2>
      <p className="mt-1 text-xs leading-5 text-[#82979c]">เก็บ raw file ไว้ก่อน รองรับ .txt, .csv, .xls และ .xlsx การ map ค่า concentration จะเพิ่มเมื่อได้รับโครงสร้างไฟล์จริง</p>
      <input ref={fileRef} type="file" accept=".txt,.csv,.xls,.xlsx" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file) }} />
      <Button disabled={busy || !sheet.ready} onClick={() => fileRef.current?.click()} variant="secondary" className="mt-3 w-full"><UploadCloud className="size-4" /> {busy ? 'กำลังทำงาน...' : 'เลือกไฟล์ Qubit'}</Button>
    </Card>

    <Card className="overflow-hidden">
      <div className="border-b border-[#e0e9ea] px-4 py-3"><h2 className="font-bold text-[#173d50]">Qubit raw files</h2><p className="mt-0.5 text-xs text-[#83979d]">{sheet.imports.length} files</p></div>
      <div className="divide-y divide-[#edf2f2]">{sheet.imports.map((item) => <QubitImportRow key={item.id} item={item} />)}</div>
      {!sheet.imports.length ? <p className="px-4 py-8 text-center text-xs leading-5 text-[#91a4a9]">ยังไม่มีไฟล์ Qubit<br />กรอก concentration ด้วยมือได้ทันที</p> : null}
    </Card>

    <Card className="p-4">
      <div className="flex items-start gap-2.5"><AlertCircle className="mt-0.5 size-4 shrink-0 text-[#c47b16]" /><div><h3 className="text-sm font-bold text-[#76501b]">Template fidelity</h3><p className="mt-1 text-xs leading-5 text-[#937044]">PDF ใช้ชีท <span className="font-bold">QC measurements</span> จาก workbook ต้นฉบับ เติมเฉพาะวันที่ ผู้ปฏิบัติงาน Sample ID และ concentration</p></div></div>
    </Card>
  </div>
}

function QubitImportRow({ item }: { item: QcImport }) {
  return <div className="px-4 py-3"><div className="flex items-start gap-2.5"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#f0f6f6] text-[#6f8991]"><FileSpreadsheet className="size-4" /></span><div className="min-w-0"><p className="truncate text-xs font-bold text-[#4c6872]">{item.fileName}</p><p className="mt-0.5 text-[10px] text-[#94a5aa]">{formatSize(item.fileSize)} · {item.uploadedByName ?? '-'}</p><span className="mt-1.5 inline-flex rounded-full border border-[#eed7aa] bg-[#fff9ec] px-1.5 py-0.5 text-[9px] font-bold text-[#a66c18]">{item.status}</span></div></div></div>
}

function EmptyState() {
  return <Card className="flex min-h-96 flex-col items-center justify-center p-8 text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-[#edf8f6] text-[#087f79]"><Microscope className="size-7" /></span><h2 className="mt-4 text-xl font-bold text-[#173d50]">ยังไม่มี batch ที่พร้อมทำ QC</h2><p className="mt-2 max-w-lg text-sm leading-6 text-[#7c9298]">QC Measurements จะสร้างอัตโนมัติเมื่อ Ext. & Prep. Task Lists 1-3 ของ batch ถูกเติมครบและ finalize แล้ว</p><div className="mt-5 flex items-center gap-2 text-xs font-bold text-[#6a8a91]"><FlaskConical className="size-4" /> รอ plate 48 ตำแหน่ง</div></Card>
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
