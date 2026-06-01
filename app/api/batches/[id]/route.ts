import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { getBatch, updateBatchLabel } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const patchSchema = z.object({ runLabel: z.string().trim().min(1).max(80) })

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await requireActor()
    return { batch: await getBatch((await params).id) }
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ batch: await updateBatchLabel((await params).id, (await readJson(request, patchSchema)).runLabel, await requireActor()) }))
}
