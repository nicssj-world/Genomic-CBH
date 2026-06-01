import { AdminView } from '@/components/admin-view'
import { requireAdminPageActor } from '@/lib/server/auth'
import { listAuditLogs, listUsers } from '@/lib/server/data'

export default async function AdminUsersPage() {
  const actor = await requireAdminPageActor()
  return <AdminView actorId={actor.id} initialUsers={await listUsers()} initialLogs={await listAuditLogs()} />
}
