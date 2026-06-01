import { requireActor } from '@/lib/server/auth'
import { getDashboard } from '@/lib/server/data'
import { respond } from '@/lib/server/route'

export async function GET() {
  return respond(async () => getDashboard(await requireActor()))
}
