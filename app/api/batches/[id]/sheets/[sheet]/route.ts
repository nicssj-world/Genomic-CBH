import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { updateSheet } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  workDate: z.string().date().nullable().optional(),
  operatorText: z.string().max(200).nullable().optional(),
  extractionLot: z.string().max(100).nullable().optional(),
  extractionExpiry: z.string().date().nullable().optional(),
  libraryLot: z.string().max(100).nullable().optional(),
  libraryExpiry: z.string().date().nullable().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; sheet: string }> }) {
  return respond(async () => {
    const values = await params
    return { batch: await updateSheet(values.id, Number(values.sheet), await readJson(request, schema), await requireActor()) }
  })
}
