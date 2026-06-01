'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Activity, Archive, ClipboardList, Database, FileUp, FlaskConical, LogOut, Microscope, ShieldCheck, Users } from 'lucide-react'
import type { Actor } from '@/lib/nipt/types'
import { api } from '@/components/ui'

const mainNav = [
  { href: '/dashboard', label: 'ภาพรวม', icon: Activity },
  { href: '/patients', label: 'ทะเบียนคนไข้', icon: Database },
  { href: '/task-lists', label: 'Task Lists', icon: ClipboardList },
  { href: '/qc-measurements', label: 'QC Measurements', icon: Microscope },
  { href: '/sample-storage', label: 'Sample Storage', icon: Archive },
  { href: '/his-imports', label: 'HIS Imports', icon: FileUp },
]

export function AppShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const nav = actor.role === 'Admin' ? [...mainNav, { href: '/admin/users', label: 'Admin', icon: Users }] : mainNav

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[228px_1fr]">
      <aside className="border-b border-[#d7e5e6] bg-[#173d50] text-white lg:min-h-screen lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-4 py-4 lg:block lg:px-5 lg:pt-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#087f79] shadow-lg shadow-black/15">
              <FlaskConical className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-bold tracking-[0.12em]">NIPT:NGS</span>
              <span className="block text-[10px] tracking-[0.18em] text-[#a9c9d1] uppercase">CBH Genomics</span>
            </span>
          </Link>
          <span className="rounded-full border border-white/15 bg-white/8 px-2 py-1 text-[10px] font-bold text-[#b7d6dc] lg:hidden">{actor.role}</span>
        </div>

        <nav className="scrollbar-thin flex gap-1 overflow-x-auto px-3 pb-3 lg:mt-9 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  active ? 'bg-white/12 text-white shadow-sm' : 'text-[#b5d1d7] hover:bg-white/7 hover:text-white'
                }`}
              >
                <Icon className={`size-4 ${active ? 'text-[#56d2c8]' : ''}`} />
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="hidden px-5 lg:absolute lg:bottom-5 lg:block lg:w-[228px]">
          <div className="border-t border-white/12 pt-4">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-8 items-center justify-center rounded-full bg-white/10"><ShieldCheck className="size-4 text-[#62d2ca]" /></span>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">{actor.displayName}</p>
                <p className="text-[10px] text-[#9fc0c8]">{actor.role} · E-Phis {actor.ephisId}</p>
              </div>
            </div>
            <button onClick={logout} className="mt-4 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold text-[#b5d1d7] transition hover:bg-white/7 hover:text-white">
              <LogOut className="size-3.5" /> ออกจากระบบ
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</main>
    </div>
  )
}
