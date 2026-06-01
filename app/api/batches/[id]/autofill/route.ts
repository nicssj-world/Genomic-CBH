import { requireActor } from '@/lib/server/auth'
import { autofillBatch } from '@/lib/server/data'
import { respond } from '@/lib/server/route'

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => autofillBatch((await params).id, await requireActor()))
}
