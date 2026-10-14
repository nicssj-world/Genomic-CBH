'use client'

import { useState } from 'react'
import { Printer } from 'lucide-react'
import type { SampleRow } from '@/lib/nipt/types'
import { printTubeLabels } from '@/lib/nipt/label-print'
import { Button } from '@/components/ui'

/** UI-only selection: never changes an identifier, clinical status, or the shared print marker. */
export function PrintLabelsModal({ patients, title, onClose }: { patients: SampleRow[]; title: string; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(patients.map((p) => p.runId)))
  const selectedPatients = patients.filter((p) => selected.has(p.runId))
  const allSelected = patients.length > 0 && selectedPatients.length === patients.length
  const toggle = (id: string) => setSelected((old) => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next })
  function handlePrint() {
    if (!selectedPatients.length) return
    printTubeLabels(selectedPatients)
    onClose()
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-center justify-between border-b border-[#e0e9ea] px-5 py-4">
        <h2 className="text-base font-bold text-[#173d50]">{title}</h2>
        <button onClick={onClose} aria-label="ปิดหน้าต่าง" className="text-[#7e989f]">✕</button>
      </div>
      <label className="flex cursor-pointer items-center gap-2.5 border-b border-[#e0e9ea] px-5 py-3 text-sm font-bold text-[#345863]">
        <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(patients.map((p) => p.runId)))} className="size-4" />
        ทั้งหมด ({patients.length} ตัวอย่าง)
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {patients.map((p) => <label key={p.runId} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-[#f5f9f9]">
          <input type="checkbox" checked={selected.has(p.runId)} onChange={() => toggle(p.runId)} className="mt-1 size-4" />
          <div className="min-w-0 flex-1">
            <p className="mono break-all text-sm font-bold text-[#355d67]">LN Halos: {p.lnHalos}</p>
            <p className="mono mt-0.5 break-all text-xs font-semibold text-[#536f78]">LN HIS: {p.ln}</p>
            <p className="mt-1 truncate text-[11px] text-[#7c9298]">{p.runSampleId} · {p.patientName ?? 'ไม่ระบุชื่อ'}</p>
          </div>
          <span className="shrink-0 rounded border border-[#e4c180] bg-[#fff8e9] px-1.5 py-0.5 text-[10px] text-[#a66a15]">{p.runType}</span>
        </label>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e0e9ea] px-5 py-4">
        <span className="text-xs text-[#789098]">{selectedPatients.length * 4} สติกเกอร์</span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={handlePrint} disabled={!selectedPatients.length}><Printer className="size-4" /> Print {selectedPatients.length} ตัวอย่าง</Button>
        </div>
      </div>
    </div>
  </div>
}
