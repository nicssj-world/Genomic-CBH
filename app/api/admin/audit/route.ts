import { requireAdmin } from '@/lib/server/auth'
import { listAuditLogs } from '@/lib/server/data'
import { respond } from '@/lib/server/route'

export async function GET() {
  return respond(async () => {
    await requireAdmin()
    return { logs: await listAuditLogs() }
  })
}
