'use client'

import { useRef, useState } from 'react'
import { FileSpreadsheet, FileUp, UploadCloud } from 'lucide-react'
import { api, Button, Card, Notice, PageHeader } from '@/components/ui'

type HisImport = {
  id: string
  fileName: string
  fileSize: number
  status: string
  uploadedAt: string
  uploadedByName: string | null
}

export function HisImportsView({ initialImports }: { initialImports: HisImport[] }) {
  const [imports, setImports] = useState(initialImports)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    setBusy(true); setNotice(null)
    try {
      const prepared = await api<{ key: string; uploadUrl: string }>('/api/his-imports/prepare', { method: 'POST', body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type }) })
      const result = await fetch(prepared.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } })
      if (!result.ok) throw new Error('บันทึกไฟล์ลงพื้นที่จัดเก็บไม่สำเร็จ')
      await api('/api/his-imports', { method: 'POST', body: JSON.stringify({ key: prepared.key, fileName: file.name, fileSize: file.size, mimeType: file.type || 'application/octet-stream' }) })
      setImports((await api<{ imports: HisImport[] }>('/api/his-imports')).imports)
      setNotice({ tone: 'success', text: `รับไฟล์ ${file.name} แล้ว · รอ mapping โครงสร้าง HIS` })
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'อัปโหลดไม่สำเร็จ' })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return <div className="mx-auto max-w-[1500px] space-y-5">
    <PageHeader eyebrow="HIS staging" title="HIS Imports" description="เก็บ raw file บนพื้นที่จัดเก็บภายใน เพื่อเตรียม mapping Name, ID/Passport, HN, DOB, Doctor และวันที่ในรอบถัดไป" />
    {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
    <Card className="border-dashed p-6 sm:p-8">
      <div className="flex flex-col items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-[#edf8f6] text-[#087f79]"><UploadCloud className="size-7" /></span>
        <h2 className="mt-4 font-bold text-[#173d50]">อัปโหลดไฟล์จาก HIS</h2>
        <p className="mt-1 max-w-lg text-sm leading-6 text-[#82979c]">V1 จะเก็บไฟล์ต้นฉบับเท่านั้น รองรับ .txt, .csv, .xls และ .xlsx ขนาดไม่เกิน 50 MB</p>
        <input ref={fileRef} type="file" accept=".txt,.csv,.xls,.xlsx" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file) }} />
        <Button disabled={busy} onClick={() => fileRef.current?.click()} className="mt-4"><FileUp className="size-4" /> {busy ? 'กำลังอัปโหลด...' : 'เลือกไฟล์ HIS'}</Button>
      </div>
    </Card>
    <Card>
      <div className="border-b border-[#e0e9ea] px-4 py-4"><h2 className="font-bold text-[#173d50]">Import history</h2><p className="mt-0.5 text-xs text-[#80959b]">{imports.length} raw files</p></div>
      <div className="divide-y divide-[#edf2f2]">{imports.map((item) => <div key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-[#f0f6f6] text-[#6f8991]"><FileSpreadsheet className="size-4" /></span><div><p className="text-sm font-bold text-[#4c6872]">{item.fileName}</p><p className="mt-0.5 text-[11px] text-[#94a5aa]">{formatSize(item.fileSize)} · {item.uploadedByName ?? '-'} · {formatDateTime(item.uploadedAt)}</p></div></div><span className="w-fit rounded-full border border-[#eed7aa] bg-[#fff9ec] px-2 py-0.5 text-[10px] font-bold text-[#a66c18]">{item.status}</span></div>)}</div>
      {!imports.length ? <p className="px-4 py-9 text-center text-sm text-[#91a4a9]">ยังไม่มีไฟล์ HIS</p> : null}
    </Card>
  </div>
}

function formatSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB` }
function formatDateTime(value: string) { return new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value)) }
