import { z } from 'zod'
import { RUN_TYPES, STAGES } from '@/lib/nipt/rules'
import { requireActor, requireAdmin } from '@/lib/server/auth'
import { deleteSample, getSample, updateSample } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const patchSchema = z.object({
  gaWeeks: z.number().int().min(0).max(50).nullable().optional(),
  gaDays: z.number().int().min(0).max(6).nullable().optional(),
  stage: z.enum(STAGES).optional(),
  runType: z.enum(RUN_TYPES).optional(),
})

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await requireActor()
    return getSample((await params).id)
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => updateSample((await params).id, await readJson(request, patchSchema), await requireActor()))
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => deleteSample((await params).id, await requireAdmin()))
}
