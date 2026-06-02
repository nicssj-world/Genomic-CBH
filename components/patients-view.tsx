'use client'

import { useMemo, useRef, useState } from 'react'
import { Download, FileClock, FileText, Search, Trash2, Upload, X } from 'lucide-react'
import type { Actor, SampleRow } from '@/lib/nipt/types'
import { RUN_TYPES, STAGES, formatGestationalAge, isGestationalAgeComplete, isGestationalAgeWarning, type RunType, type SampleStage } from '@/lib/nipt/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, RunBadge, Select, StageBadge } from '@/components/ui'

type Revision = {
  id: string
  revisionNumber: number
  fileName: string
  fileSize: number
  uploadedAt: string
  uploadedByName: string | null
  isActive: boolean
  voidedAt: string | null
  voidReason: string | null
}

export function PatientsView({ actor, initialSamples, initialSelectedId }: { actor: Actor; initialSamples: SampleRow[]; initialSelectedId?: string }) {
  const [samples, setSamples] = useState(initialSamples)
  const [selectedId, setSelectedId] = useState(initialSelectedId ?? '')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const selected = samples.find((sample) => sample.id === selectedId) ?? null
  const filtered = useMemo(() => {
    const key = search.trim().toLowerCase()
    return key ? samples.filter((sample) => [sample.ln, sample.lnHalos, sample.hn, sample.patientName].some((value) => value?.toLowerCase().includes(key))) : samples
  }, [samples, search])

  async function refresh(keepId = selectedId) {
    const response = await api<{ samples: SampleRow[] }>('/api/samples')
    setSamples(response.samples)
    setSelectedId(keepId)
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <PageHeader eyebrow="Patient registry" title="ทะเบียนคนไข้" description="ค้นหา แก้ข้อมูล workflow และจัดการไฟล์ผลตรวจ PDF ตาม LN" />
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      <Card>
        <div className="flex flex-col gap-3 border-b border-[#e0e9ea] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-bold text-[#173d50]">Samples</h2><p className="mt-0.5 text-xs text-[#80959b]">{samples.length} รายการในระบบ</p></div>
          <div className="relative w-full sm:w-80"><Search className="absolute left-3 top-2.5 size-4 text-[#8ca3a8]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="ค้นหา LN, LN Halos, HN หรือชื่อ" /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-[#f7fafa] text-[11px] tracking-[0.08em] text-[#779097] uppercase"><tr><th className="px-4 py-2.5">LN</th><th className="px-3 py-2.5">LN Halos</th><th className="px-3 py-2.5">Name / HN</th><th className="px-3 py-2.5">GA</th><th className="px-3 py-2.5">Run Type</th><th className="px-3 py-2.5">Stage</th><th className="px-3 py-2.5">Result</th><th className="px-4 py-2.5"></th></tr></thead>
            <tbody className="divide-y divide-[#edf2f2]">
              {filtered.map((sample) => <tr key={sample.id} className="hover:bg-[#fbfdfd]">
                <td className="mono px-4 py-3 font-bold text-[#173d50]">{sample.ln}</td>
                <td className="mono px-3 py-3 text-xs text-[#45636e]">{sample.lnHalos}</td>
                <td className="px-3 py-3"><span className="block font-semibold text-[#45636e]">{sample.patientName ?? '-'}</span><span className="text-xs text-[#93a5aa]">{sample.hn ? `HN ${sample.hn}` : 'ยังไม่มีข้อมูล HIS'}</span></td>
                <td className={`px-3 py-3 font-bold ${isGestationalAgeWarning(sample.gaWeeks) ? 'text-[#be3d49]' : 'text-[#6e858d]'}`}>{formatGestationalAge(sample.gaWeeks, sample.gaDays)}</td>
                <td className="px-3 py-3"><RunBadge runType={sample.runType} /></td>
                <td className="px-3 py-3"><StageBadge stage={sample.stage} /></td>
                <td className="px-3 py-3">{sample.activeResult ? <span className="flex items-center gap-1 text-xs font-bold text-[#4f7a54]"><FileText className="size-3.5" /> PDF</span> : <span className="text-xs text-[#a0afb3]">-</span>}</td>
                <td className="px-4 py-3 text-right"><Button variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={() => setSelectedId(sample.id)}>เปิด</Button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {!filtered.length ? <p className="px-4 py-10 text-center text-sm text-[#91a4a9]">ไม่พบรายการที่ค้นหา</p> : null}
      </Card>
      {selected ? <PatientDrawer actor={actor} sample={selected} onClose={() => setSelectedId('')} onDelete={async () => { await refresh(''); setNotice('ลบตัวอย่างแล้ว · LN Halos เดิมจะไม่ถูกนำกลับมาใช้ซ้ำ') }} onRefresh={async (message) => { await refresh(selected.id); setNotice(message) }} /> : null}
    </div>
  )
}

function PatientDrawer({ actor, sample, onClose, onDelete, onRefresh }: { actor: Actor; sample: SampleRow; onClose: () => void; onDelete: () => Promise<void>; onRefresh: (message: string) => Promise<void> }) {
  const [gaWeeks, setGaWeeks] = useState(sample.gaWeeks?.toString() ?? '')
  const [gaDays, setGaDays] = useState(sample.gaDays?.toString() ?? '')
  const [stage, setStage] = useState<SampleStage>(sample.stage)
  const [runType, setRunType] = useState<RunType>(sample.runType)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revisions, setRevisions] = useState<Revision[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function save() {
    setError('')
    const parsedGaWeeks = gaWeeks === '' ? null : Number(gaWeeks)
    const parsedGaDays = gaDays === '' ? null : Number(gaDays)
    if (!isGestationalAgeComplete(parsedGaWeeks, parsedGaDays)) {
      setError('กรุณากรอก GA Weeks และ Days ให้ครบทั้งสองช่อง หรือเว้นว่างทั้งสองช่อง')
      return
    }
    setBusy(true)
    try {
      await api(`/api/samples/${sample.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          gaWeeks: parsedGaWeeks,
          gaDays: parsedGaDays,
          stage,
          runType,
        }),
      })
      await onRefresh('บันทึกข้อมูลตัวอย่างแล้ว')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function upload(file: File) {
    setBusy(true)
    setError('')
    try {
      const prepared = await api<{ key: string; revisionNumber: number; uploadUrl: string }>(`/api/samples/${sample.id}/results/prepare`, {
        method: 'POST',
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type }),
      })
      const upload = await fetch(prepared.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!upload.ok) throw new Error('บันทึกไฟล์ลงพื้นที่จัดเก็บไม่สำเร็จ')
      await api(`/api/samples/${sample.id}/results`, {
        method: 'POST',
        body: JSON.stringify({ key: prepared.key, revisionNumber: prepared.revisionNumber, fileName: file.name, fileSize: file.size }),
      })
      await onRefresh('อัปโหลดผลตรวจ PDF แล้ว')
      if (actor.role === 'Admin') await loadHistory()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'อัปโหลดไม่สำเร็จ')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function download(revisionId: string) {
    const result = await api<{ downloadUrl: string }>(`/api/results/${revisionId}/download`)
    window.location.href = result.downloadUrl
  }

  async function loadHistory() {
    setRevisions((await api<{ revisions: Revision[] }>(`/api/samples/${sample.id}/results`)).revisions)
  }

  async function voidRevision(revisionId: string) {
    const reason = window.prompt('เหตุผลที่ void revision นี้')
    if (!reason) return
    await api(`/api/results/${revisionId}/void`, { method: 'POST', body: JSON.stringify({ reason }) })
    await loadHistory()
    await onRefresh('Void revision แล้ว')
  }

  async function removeSample() {
    if (!window.confirm(`ยืนยันการลบ LN ${sample.ln}?\nLN Halos ${sample.lnHalos} จะไม่ถูกนำกลับมาใช้ซ้ำ`)) return
    setBusy(true)
    setError('')
    try {
      await api(`/api/samples/${sample.id}`, { method: 'DELETE' })
      await onDelete()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'ลบตัวอย่างไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-[#173d50]/24 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="scrollbar-thin h-full w-full max-w-xl overflow-y-auto bg-[#fbfdfd] shadow-[-18px_0_50px_rgba(21,54,65,0.18)]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#dfe9ea] bg-white/95 px-5 py-4 backdrop-blur">
          <div><p className="text-[10px] font-bold tracking-[0.16em] text-[#087f79] uppercase">Sample detail</p><h2 className="mono mt-1 text-lg font-bold text-[#173d50]">{sample.ln}</h2></div>
          <button onClick={onClose} className="rounded-lg p-2 text-[#7c9399] hover:bg-[#eef4f4]"><X className="size-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          <Card className="p-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="LN Halos" value={sample.lnHalos} mono />
              <Info label="Run ID" value={sample.runSampleId} mono />
              <Info label="Patient" value={sample.patientName ?? '-'} />
              <Info label="HN" value={sample.hn ?? '-'} />
              <Info label="Doctor" value={sample.doctor ?? '-'} />
              <Info label="Imported by" value={sample.importedByName ?? '-'} />
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="font-bold text-[#173d50]">Workflow</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Gestational Age · Weeks"><Input type="number" min="0" max="50" value={gaWeeks} onChange={(event) => setGaWeeks(event.target.value)} /></Field>
              <Field label="Days" hint="กรอก 0 หากไม่มีเศษวัน"><Input type="number" min="0" max="6" value={gaDays} onChange={(event) => setGaDays(event.target.value)} /></Field>
              <Field label="Run type"><Select value={runType} onChange={(event) => setRunType(event.target.value as RunType)}>{RUN_TYPES.map((item) => <option key={item}>{item}</option>)}</Select></Field>
              <Field label="Stage"><Select value={stage} onChange={(event) => setStage(event.target.value as SampleStage)}>{STAGES.map((item) => <option key={item}>{item}</option>)}</Select></Field>
            </div>
            {Number(gaWeeks) >= 22 ? <div className="mt-3"><Notice tone="danger">GA ตั้งแต่ 22W ขึ้นไป กรุณาตรวจสอบก่อนดำเนินการต่อ</Notice></div> : null}
            {error ? <div className="mt-3"><Notice tone="danger">{error}</Notice></div> : null}
            <Button disabled={busy} onClick={save} className="mt-4 w-full">บันทึกข้อมูล</Button>
          </Card>
          <Card className="p-4">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-[#173d50]">Result PDF</h3><p className="mt-0.5 text-xs text-[#87999f]">Staff อัปโหลดครั้งแรก · Admin เพิ่ม revision ได้</p></div><FileText className="size-5 text-[#087f79]" /></div>
            {sample.activeResult ? <div className="mt-3 flex items-center justify-between rounded-lg border border-[#dce8e9] bg-[#f8fbfb] p-3"><div><p className="text-xs font-bold text-[#4d6972]">{sample.activeResult.fileName}</p><p className="mt-1 text-[11px] text-[#8ca0a5]">Revision {sample.activeResult.revisionNumber}</p></div><Button variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={() => download(sample.activeResult!.id)}><Download className="size-3.5" /> ดาวน์โหลด</Button></div> : <p className="mt-3 rounded-lg border border-dashed border-[#cddfe0] px-3 py-5 text-center text-xs text-[#91a4a9]">ยังไม่มีไฟล์ผลตรวจ</p>}
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file) }} />
            <Button disabled={busy || (actor.role !== 'Admin' && Boolean(sample.activeResult))} variant="secondary" className="mt-3 w-full" onClick={() => fileRef.current?.click()}><Upload className="size-4" /> {sample.activeResult ? 'อัปโหลด revision ใหม่' : 'อัปโหลดผลตรวจ PDF'}</Button>
            {actor.role === 'Admin' ? <Button variant="ghost" className="mt-1 w-full" onClick={loadHistory}><FileClock className="size-4" /> ดู revision history</Button> : null}
            {revisions ? <div className="mt-3 space-y-2">{revisions.map((revision) => <div key={revision.id} className="rounded-lg border border-[#e0e9ea] p-2.5 text-xs"><div className="flex items-start justify-between gap-2"><div><p className="font-bold text-[#526e77]">Rev {revision.revisionNumber} · {revision.fileName}</p><p className="mt-1 text-[11px] text-[#92a4a9]">{revision.uploadedByName ?? '-'} · {formatDateTime(revision.uploadedAt)}</p></div>{revision.isActive ? <span className="rounded bg-[#eef8ef] px-1.5 py-0.5 text-[10px] font-bold text-[#528057]">ACTIVE</span> : <span className="rounded bg-[#f4f4f4] px-1.5 py-0.5 text-[10px] font-bold text-[#909090]">VOID</span>}</div><div className="mt-2 flex gap-1"><Button variant="ghost" className="px-2 py-1 text-[11px]" onClick={() => download(revision.id)}>ดาวน์โหลด</Button>{revision.isActive ? <Button variant="danger" className="px-2 py-1 text-[11px]" onClick={() => voidRevision(revision.id)}>Void</Button> : null}</div></div>)}</div> : null}
          </Card>
          {actor.role === 'Admin' ? <Card className="border-[#edc7cb] bg-[#fffafa] p-4"><h3 className="font-bold text-[#a83541]">ลบตัวอย่าง</h3><p className="mt-1 text-xs leading-5 text-[#9b6a70]">ใช้สำหรับรายการที่สร้างผิดก่อนเริ่ม workflow เท่านั้น ระบบจะไม่ใช้ LN Halos เดิมซ้ำอีก</p><Button disabled={busy} variant="danger" className="mt-3 w-full" onClick={removeSample}><Trash2 className="size-4" /> ลบตัวอย่างนี้</Button></Card> : null}
        </div>
      </aside>
    </div>
  )
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div><p className="text-[11px] font-bold text-[#8ba0a5]">{label}</p><p className={`mt-1 text-xs font-semibold text-[#52707a] ${mono ? 'mono' : ''}`}>{value}</p></div>
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
}
