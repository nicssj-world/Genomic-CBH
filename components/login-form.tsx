'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FlaskConical, KeyRound, ScanLine, ShieldCheck, UserRound } from 'lucide-react'
import { api, Button, Input, Notice } from '@/components/ui'

export function LoginForm() {
  const router = useRouter()
  const [ephisId, setEphisId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ ephisId, password }) })
      router.replace('/dashboard')
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'เข้าสู่ระบบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#edf5f4] px-4 py-8">
      <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(#d8e8e7_1px,transparent_1px),linear-gradient(90deg,#d8e8e7_1px,transparent_1px)] [background-size:32px_32px]" />
      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-2xl border border-[#d4e3e4] bg-white shadow-[0_30px_90px_rgba(17,62,71,0.14)] lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative hidden overflow-hidden bg-[#173d50] p-9 text-white lg:block">
          <div className="absolute -right-12 -top-20 size-64 rounded-full border border-white/10" />
          <div className="absolute -right-4 -top-9 size-44 rounded-full border border-[#62d2ca]/20" />
          <div className="flex size-12 items-center justify-center rounded-xl bg-[#087f79]"><FlaskConical className="size-6" /></div>
          <p className="mt-20 text-xs font-bold tracking-[0.2em] text-[#72d6cd] uppercase">CBH Genomics Operations</p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.05em]">NIPT:NGS<br />Sample Flow</h1>
          <p className="mt-4 max-w-sm text-sm leading-7 text-[#b6d2d8]">รับตัวอย่าง ติดตามสถานะ จัด plate extraction และบันทึกผลตรวจในพื้นที่ทำงานเดียว</p>
          <div className="mt-16 grid grid-cols-3 gap-3">
            {[['01', 'Scan LN'], ['02', 'Extract'], ['03', 'Result PDF']].map(([number, label]) => (
              <div key={number} className="border-t border-white/20 pt-3">
                <p className="mono text-xs text-[#67d4ca]">{number}</p>
                <p className="mt-1 text-xs font-semibold text-[#d1e4e8]">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 py-8 sm:px-10 sm:py-12">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#087f79] text-white"><FlaskConical className="size-5" /></span>
            <div><p className="font-bold text-[#173d50]">NIPT:NGS</p><p className="text-[10px] tracking-[0.16em] text-[#6d878f] uppercase">CBH Genomics</p></div>
          </div>
          <p className="mt-10 text-xs font-bold tracking-[0.18em] text-[#087f79] uppercase lg:mt-0">Secure workspace</p>
          <h2 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-[#173d50]">เข้าสู่ระบบ</h2>
          <p className="mt-2 text-sm text-[#6e858d]">ใช้รหัส E-Phis และรหัสผ่านที่ได้รับจาก Admin</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-[#57737c]">E-Phis</span>
              <div className="relative"><UserRound className="absolute left-3 top-2.5 size-4 text-[#88a1a7]" /><Input autoFocus inputMode="numeric" value={ephisId} onChange={(event) => setEphisId(event.target.value)} className="pl-9" placeholder="รหัสพนักงาน" /></div>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-[#57737c]">Password</span>
              <div className="relative"><KeyRound className="absolute left-3 top-2.5 size-4 text-[#88a1a7]" /><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="pl-9" placeholder="รหัสผ่าน" /></div>
            </label>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <Button disabled={busy} className="mt-2 w-full py-2.5">{busy ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}</Button>
          </form>
          <div className="mt-9 grid grid-cols-2 gap-3 border-t border-[#e2ebec] pt-5 text-[11px] text-[#799096]">
            <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-[#087f79]" /> Private access</span>
            <span className="flex items-center gap-1.5"><ScanLine className="size-3.5 text-[#087f79]" /> Barcode ready</span>
          </div>
        </div>
      </section>
    </main>
  )
}
