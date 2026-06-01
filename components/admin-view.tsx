'use client'

import { useState } from 'react'
import { History, KeyRound, Plus, ShieldCheck, UserCog, Users } from 'lucide-react'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select } from '@/components/ui'

type AdminUser = { id: string; ephis_id: string; display_name: string; role: 'Admin' | 'CBH-Staff'; is_active: boolean; created_at: string }
type AuditLog = { id: number; actorName: string; action: string; entity_type: string; entity_id: string | null; created_at: string }

export function AdminView({ actorId, initialUsers, initialLogs }: { actorId: string; initialUsers: AdminUser[]; initialLogs: AuditLog[] }) {
  const [users, setUsers] = useState(initialUsers)
  const [logs, setLogs] = useState(initialLogs)
  const [tab, setTab] = useState<'users' | 'audit'>('users')
  const [openCreate, setOpenCreate] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  async function refreshUsers() { setUsers((await api<{ users: AdminUser[] }>('/api/admin/users')).users) }
  async function refreshLogs() { setLogs((await api<{ logs: AuditLog[] }>('/api/admin/audit')).logs) }

  async function updateUser(id: string, input: Record<string, unknown>) {
    try {
      await api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
      await refreshUsers(); await refreshLogs(); setNotice({ tone: 'success', text: 'บันทึกข้อมูลผู้ใช้แล้ว' })
    } catch (error) { setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ' }) }
  }

  async function resetPassword(id: string) {
    const password = window.prompt('กำหนดรหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร')
    if (!password) return
    try {
      await api(`/api/admin/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) })
      await refreshLogs(); setNotice({ tone: 'success', text: 'รีเซ็ตรหัสผ่านแล้ว' })
    } catch (error) { setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'รีเซ็ตรหัสผ่านไม่สำเร็จ' }) }
  }

  return <div className="mx-auto max-w-[1500px] space-y-5">
    <PageHeader eyebrow="Administration" title="Admin Console" description="จัดการบัญชีผู้ใช้และตรวจสอบ audit log ของระบบ NIPT" actions={tab === 'users' ? <Button onClick={() => setOpenCreate(true)}><Plus className="size-4" /> เพิ่มผู้ใช้</Button> : undefined} />
    {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
    <div className="flex gap-1 rounded-xl border border-[#dbe7e8] bg-white p-1 shadow-sm">
      <button onClick={() => setTab('users')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${tab === 'users' ? 'bg-[#edf8f6] text-[#087f79]' : 'text-[#769097] hover:bg-[#f7fafa]'}`}><Users className="size-4" /> Users</button>
      <button onClick={() => setTab('audit')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${tab === 'audit' ? 'bg-[#edf8f6] text-[#087f79]' : 'text-[#769097] hover:bg-[#f7fafa]'}`}><History className="size-4" /> Audit log</button>
    </div>
    {tab === 'users' ? <Card>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#f7fafa] text-[11px] tracking-[0.08em] text-[#779097] uppercase"><tr><th className="px-4 py-2.5">User</th><th className="px-3 py-2.5">E-Phis</th><th className="px-3 py-2.5">Role</th><th className="px-3 py-2.5">Status</th><th className="px-4 py-2.5"></th></tr></thead><tbody className="divide-y divide-[#edf2f2]">{users.map((user) => <tr key={user.id}><td className="px-4 py-3"><p className="font-bold text-[#45636e]">{user.display_name}</p>{user.id === actorId ? <p className="text-[10px] font-bold text-[#087f79]">บัญชีของคุณ</p> : null}</td><td className="mono px-3 py-3 text-xs text-[#668088]">{user.ephis_id}</td><td className="px-3 py-3"><Select className="w-auto py-1 text-xs" value={user.role} onChange={(event) => updateUser(user.id, { role: event.target.value })}><option>Admin</option><option>CBH-Staff</option></Select></td><td className="px-3 py-3"><button disabled={user.id === actorId} onClick={() => updateUser(user.id, { isActive: !user.is_active })} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${user.is_active ? 'border-[#c7e0c8] bg-[#f0f8f1] text-[#518058]' : 'border-[#e0d7d8] bg-[#f7f4f4] text-[#8d7b7d]'}`}>{user.is_active ? 'ACTIVE' : 'INACTIVE'}</button></td><td className="px-4 py-3 text-right"><Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => resetPassword(user.id)}><KeyRound className="size-3.5" /> Reset password</Button></td></tr>)}</tbody></table></div>
    </Card> : <Card>
      <div className="divide-y divide-[#edf2f2]">{logs.map((log) => <div key={log.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="mono text-xs font-bold text-[#486771]">{log.action}</p><p className="mt-1 text-[11px] text-[#93a4a9]">{log.actorName} · {log.entity_type}{log.entity_id ? ` · ${log.entity_id}` : ''}</p></div><p className="text-[11px] text-[#93a4a9]">{formatDateTime(log.created_at)}</p></div>)}</div>{!logs.length ? <p className="px-4 py-9 text-center text-sm text-[#91a4a9]">ยังไม่มี audit log</p> : null}
    </Card>}
    {openCreate ? <CreateUserModal onClose={() => setOpenCreate(false)} onCreated={async () => { setOpenCreate(false); await refreshUsers(); await refreshLogs(); setNotice({ tone: 'success', text: 'เพิ่มผู้ใช้แล้ว' }) }} /> : null}
  </div>
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [form, setForm] = useState({ ephisId: '', displayName: '', role: 'CBH-Staff', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { await api('/api/admin/users', { method: 'POST', body: JSON.stringify(form) }); await onCreated() }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'เพิ่มผู้ใช้ไม่สำเร็จ') }
    finally { setBusy(false) }
  }
  return <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#173d50]/28 px-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><form onSubmit={create} className="paper w-full max-w-md rounded-xl p-5"><div className="flex items-center gap-2"><UserCog className="size-5 text-[#087f79]" /><h2 className="font-bold text-[#173d50]">เพิ่มผู้ใช้ NIPT</h2></div><div className="mt-4 space-y-3"><Field label="E-Phis"><Input inputMode="numeric" value={form.ephisId} onChange={(event) => setForm({ ...form, ephisId: event.target.value })} /></Field><Field label="ชื่อที่แสดง"><Input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></Field><Field label="Role"><Select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option>CBH-Staff</option><option>Admin</option></Select></Field><Field label="รหัสผ่านเริ่มต้น"><Input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></Field></div>{error ? <div className="mt-3"><Notice tone="danger">{error}</Notice></div> : null}<div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>ยกเลิก</Button><Button disabled={busy}><ShieldCheck className="size-4" /> เพิ่มผู้ใช้</Button></div></form></div>
}

function formatDateTime(value: string) { return new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value)) }
