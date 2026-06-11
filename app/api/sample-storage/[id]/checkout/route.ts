import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { checkOutStorageSlot } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ reason: z.string().trim().min(1).max(500) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await params
    const { reason } = await readJson(request, schema)
    return { storage: await checkOutStorageSlot(id, reason, await requireActor()) }
  })
}
