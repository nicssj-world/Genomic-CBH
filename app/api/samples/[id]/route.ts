import { z } from 'zod'
import { RUN_TYPES, STAGES } from '@/lib/nipt/rules'
import { requireActor } from '@/lib/server/auth'
import { getSample, updateSample } from '@/lib/server/data'
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
