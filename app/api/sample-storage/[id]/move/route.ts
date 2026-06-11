import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { moveStorageSlot } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ targetSlotId: z.string().uuid() })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await params
    const { targetSlotId } = await readJson(request, schema)
    return { storage: await moveStorageSlot(id, targetSlotId, await requireActor()) }
  })
}
