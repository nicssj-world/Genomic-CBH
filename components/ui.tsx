import type { ReactNode } from 'react'
import { AlertTriangle, LoaderCircle } from 'lucide-react'
import type { RunType, SampleStage } from '@/lib/nipt/rules'

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}) {
  const variants = {
    primary: 'bg-[#087f79] text-white hover:bg-[#08655f] shadow-sm',
    secondary: 'border border-[#c9dadd] bg-white text-[#244854] hover:border-[#87aaae] hover:bg-[#f8fbfb]',
    ghost: 'text-[#55727c] hover:bg-[#eef5f4] hover:text-[#244854]',
    danger: 'border border-[#edc7cb] bg-[#fff7f7] text-[#af3541] hover:bg-[#ffebed]',
  }
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-[#cfdee0] bg-white px-3 py-2 text-sm text-[#173d50] outline-none transition placeholder:text-[#9aafb4] focus:border-[#087f79] focus:ring-3 focus:ring-[#087f79]/10 ${className}`}
      {...props}
    />
  )
}

export function Select({ className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-lg border border-[#cfdee0] bg-white px-3 py-2 text-sm text-[#173d50] outline-none transition focus:border-[#087f79] focus:ring-3 focus:ring-[#087f79]/10 ${className}`}
      {...props}
    />
  )
}

export function Textarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-[#cfdee0] bg-white px-3 py-2 text-sm text-[#173d50] outline-none transition placeholder:text-[#9aafb4] focus:border-[#087f79] focus:ring-3 focus:ring-[#087f79]/10 ${className}`}
      {...props}
    />
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[#58747d]">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-[#8ba0a5]">{hint}</span> : null}
    </label>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`paper rounded-xl ${className}`}>{children}</section>
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-bold tracking-[0.18em] text-[#087f79] uppercase">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-[-0.04em] text-[#173d50] sm:text-3xl">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-[#6a838c]">{description}</p>
      </div>
      {actions}
    </header>
  )
}

export function StageBadge({ stage }: { stage: SampleStage }) {
  const styles: Record<SampleStage, string> = {
    Received: 'border-[#d5e0e2] bg-[#f6f9f9] text-[#607b84]',
    Extract: 'border-[#bde3de] bg-[#eefaf8] text-[#087f79]',
    Pooling: 'border-[#c9d9f2] bg-[#f2f6fc] text-[#3c669b]',
    Sequencing: 'border-[#ded0ec] bg-[#faf5fd] text-[#735390]',
    Completed: 'border-[#c8dfc6] bg-[#f1f9f0] text-[#4d7c45]',
  }
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${styles[stage]}`}>{stage}</span>
}

export function RunBadge({ runType }: { runType: RunType }) {
  const styles: Record<RunType, string> = {
    Normal: 'bg-[#edf4f5] text-[#5b737c]',
    'Re-Library': 'bg-[#fff4dd] text-[#a76511]',
    'Re-Sampling': 'bg-[#fdebed] text-[#b13f4a]',
  }
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${styles[runType]}`}>{runType}</span>
}

export function Loading({ label = 'กำลังโหลด' }: { label?: string }) {
  return <span className="inline-flex items-center gap-2 text-sm text-[#6c858d]"><LoaderCircle className="size-4 animate-spin" />{label}</span>
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'danger' | 'success' }) {
  const styles = {
    info: 'border-[#bddedc] bg-[#f1faf9] text-[#176b68]',
    warning: 'border-[#eed4a6] bg-[#fff9ed] text-[#99601b]',
    danger: 'border-[#efc7cc] bg-[#fff5f6] text-[#a83541]',
    success: 'border-[#c6e2ca] bg-[#f3faf4] text-[#4b7b51]',
  }
  return <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${styles[tone]}`}><AlertTriangle className="mt-0.5 size-4 shrink-0" />{children}</div>
}

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? 'Request failed')
  return data as T
}
