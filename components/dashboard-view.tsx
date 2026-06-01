'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertOctagon, ArrowRight, Barcode, ClipboardList, Database, FlaskConical, ScanLine, TestTube2 } from 'lucide-react'
import type { DashboardData } from '@/lib/nipt/types'
import { RUN_TYPES, STAGES, formatGestationalAge, isGestationalAgeWarning, type RunType, type SampleStage } from '@/lib/nipt/rules'
import { api, Button, Card, Notice, PageHeader, RunBadge, Select, StageBadge } from '@/components/ui'

export function DashboardView({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData)
  const [ln, setLn] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string; sampleId?: string } | null>(null)
  const [stage, setStage] = useState<SampleStage | 'all'>('all')
  const [runType, setRunType] = useState<RunType | 'all'>('all')
  const [gaOnly, setGaOnly] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)

  useEffect(() => scanRef.current?.focus(), [])

  async function refresh() {
    setData(await api<DashboardData>('/api/dashboard'))
  }

  async function register(event: React.FormEvent) {
    event.preventDefault()
    if (!ln.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await api<{ duplicate: boolean; sample_id: string; ln_halos: string }>('/api/samples', {
        method: 'POST',
        body: JSON.stringify({ ln }),
      })
      setMessage(result.duplicate
        ? { tone: 'warning', text: `LN ${ln.trim()} มีอยู่แล้ว ระบบเปิดรายการเดิมให้ตรวจสอบได้`, sampleId: result.sample_id }
        : { tone: 'success', text: `รับ LN ${ln.trim()} แล้ว · LN Halos ${result.ln_halos}` })
      setLn('')
      await refresh()
    } catch (error) {
      setMessage({ tone: 'danger', text: error instanceof Error ? error.message : 'รับ LN ไม่สำเร็จ' })
    } finally {
      setBusy(false)
      scanRef.current?.focus()
    }
  }

  const recent = useMemo(() => data.recentSamples.filter((sample) => {
    if (stage !== 'all' && sample.stage !== stage) return false
    if (runType !== 'all' && sample.runType !== runType) return false
    if (gaOnly && !isGestationalAgeWarning(sample.gaWeeks)) return false
    return true
  }), [data.recentSamples, gaOnly, runType, stage])

  const assigned = data.activeBatch?.slots.filter((slot) => slot.sampleRunId).length ?? 0

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <PageHeader eyebrow="Overview" title="ภาพรวม NIPT:NGS" description={`พร้อมรับตัวอย่างใหม่ · ผู้ใช้งาน ${data.actor.displayName}`} />

      <Card className="overflow-hidden border-[#bddedc]">
        <div className="grid lg:grid-cols-[1fr_320px]">
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-xs font-bold text-[#087f79]"><ScanLine className="size-4" /> BARCODE INTAKE</div>
            <form onSubmit={register} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Barcode className="absolute left-3 top-3 size-5 text-[#7c969b]" />
                <input
                  ref={scanRef}
                  value={ln}
                  onChange={(event) => setLn(event.target.value)}
                  className="mono w-full rounded-xl border border-[#bcd4d5] bg-[#fbfdfd] py-3 pr-3 pl-11 text-base font-medium tracking-[0.06em] text-[#173d50] outline-none transition placeholder:font-sans placeholder:tracking-normal placeholder:text-[#99afb4] focus:border-[#087f79] focus:ring-4 focus:ring-[#087f79]/10"
                  placeholder="ยิงบาร์โค้ด หรือกรอก LN แล้วกด Enter"
                />
              </div>
              <Button disabled={busy} className="px-5 py-3"><ScanLine className="size-4" />{busy ? 'กำลังรับเข้า' : 'รับ LN'}</Button>
            </form>
            {message ? <div className="mt-3"><Notice tone={message.tone}>{message.text}{message.sampleId ? <Link href={`/patients?sample=${message.sampleId}`} className="ml-2 font-bold underline">เปิดรายการเดิม</Link> : null}</Notice></div> : null}
          </div>
          <div className="border-t border-[#d8e7e7] bg-[#f3f9f8] p-4 lg:border-t-0 lg:border-l">
            <p className="text-[11px] font-bold tracking-[0.14em] text-[#628087] uppercase">Active extraction batch</p>
            {data.activeBatch ? <>
              <div className="mt-2 flex items-end justify-between"><span className="mono text-lg font-bold text-[#173d50]">{data.activeBatch.runLabel}</span><span className="text-xs font-bold text-[#087f79]">{assigned}/45 samples</span></div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#d9e8e7]"><div className="h-full rounded-full bg-[#087f79]" style={{ width: `${(assigned / 45) * 100}%` }} /></div>
              <Link href="/task-lists" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#087f79] hover:underline">จัดการ Task Lists <ArrowRight className="size-3" /></Link>
            </> : <p className="mt-2 text-sm text-[#779096]">ยังไม่มี batch ที่กำลังจัดตัวอย่าง</p>}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={<Database />} label="คนไข้ทั้งหมด" value={data.totalSamples} />
        <Kpi icon={<TestTube2 />} label="รอจัด Extract" value={data.queueCount} tone="teal" />
        <Kpi icon={<FlaskConical />} label="กำลัง Extract" value={data.counts.Extract} />
        <Kpi icon={<ClipboardList />} label="Sequencing" value={data.counts.Sequencing} />
        <Kpi icon={<AlertOctagon />} label="GA ≥ 22W" value={data.gaWarningCount} tone="danger" />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-[#e0e9ea] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-bold text-[#173d50]">รายการรับเข้าล่าสุด</h2><p className="mt-0.5 text-xs text-[#80959b]">ตรวจสอบ LN, LN Halos และสถานะล่าสุด</p></div>
          <div className="flex flex-wrap gap-2">
            <Select className="w-auto py-1.5 text-xs" value={stage} onChange={(event) => setStage(event.target.value as SampleStage | 'all')}>
              <option value="all">ทุกขั้นตอน</option>{STAGES.map((item) => <option key={item}>{item}</option>)}
            </Select>
            <Select className="w-auto py-1.5 text-xs" value={runType} onChange={(event) => setRunType(event.target.value as RunType | 'all')}>
              <option value="all">ทุก Run type</option>{RUN_TYPES.map((item) => <option key={item}>{item}</option>)}
            </Select>
            <label className="flex items-center gap-1.5 rounded-lg border border-[#cfdee0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#6a838b]"><input type="checkbox" checked={gaOnly} onChange={(event) => setGaOnly(event.target.checked)} /> GA warning</label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#f7fafa] text-[11px] tracking-[0.08em] text-[#779097] uppercase"><tr><th className="px-4 py-2.5">LN</th><th className="px-3 py-2.5">LN Halos</th><th className="px-3 py-2.5">Patient</th><th className="px-3 py-2.5">GA</th><th className="px-3 py-2.5">Run</th><th className="px-3 py-2.5">Stage</th><th className="px-4 py-2.5">Received</th></tr></thead>
            <tbody className="divide-y divide-[#edf2f2]">
              {recent.map((sample) => <tr key={sample.id} className="hover:bg-[#fbfdfd]"><td className="mono px-4 py-3 font-bold text-[#173d50]">{sample.ln}</td><td className="mono px-3 py-3 text-xs text-[#45636e]">{sample.lnHalos}</td><td className="px-3 py-3 text-[#58727b]">{sample.patientName ?? '-'}</td><td className={`px-3 py-3 font-bold ${isGestationalAgeWarning(sample.gaWeeks) ? 'text-[#be3d49]' : 'text-[#6e858d]'}`}>{formatGestationalAge(sample.gaWeeks, sample.gaDays)}</td><td className="px-3 py-3"><RunBadge runType={sample.runType} /></td><td className="px-3 py-3"><StageBadge stage={sample.stage} /></td><td className="px-4 py-3 text-xs text-[#81969c]">{formatDateTime(sample.importedAt)}</td></tr>)}
            </tbody>
          </table>
        </div>
        {!recent.length ? <p className="px-4 py-8 text-center text-sm text-[#91a4a9]">ไม่พบรายการตามตัวกรอง</p> : null}
      </Card>
    </div>
  )
}

function Kpi({ icon, label, value, tone = 'default' }: { icon: React.ReactNode; label: string; value: number; tone?: 'default' | 'teal' | 'danger' }) {
  const colors = tone === 'danger' ? 'text-[#be3d49] bg-[#fff1f2]' : tone === 'teal' ? 'text-[#087f79] bg-[#edf9f7]' : 'text-[#587984] bg-[#f0f5f5]'
  return <Card className="p-3.5 sm:p-4"><div className={`flex size-8 items-center justify-center rounded-lg [&>svg]:size-4 ${colors}`}>{icon}</div><p className="mt-4 text-[11px] font-bold text-[#789097]">{label}</p><p className={`mono mt-1 text-2xl font-bold ${tone === 'danger' ? 'text-[#be3d49]' : 'text-[#173d50]'}`}>{value}</p></Card>
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
}
