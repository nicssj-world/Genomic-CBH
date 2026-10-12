import { z } from 'zod'
import { requireAdmin } from '@/lib/server/auth'
import { removeTaskSlotSample } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ runId: z.string().uuid() })

export async function POST(request: Request, { params }: { params: Promise<{ id: string; slot: string }> }) {
  return respond(async () => {
    const { id, slot } = await params
    const { runId } = await readJson(request, schema)
    return removeTaskSlotSample(id, slot, runId, await requireAdmin())
  })
}
