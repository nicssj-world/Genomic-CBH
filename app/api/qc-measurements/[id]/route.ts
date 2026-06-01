import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { updateQcSheet } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const measurementSchema = z.object({
  slotNumber: z.number().int().min(1).max(48),
  concentration: z.number().finite().min(0).max(100000).nullable(),
})

const schema = z.object({
  workDate: z.string().date().nullable().optional(),
  operatorText: z.string().trim().max(200).nullable().optional(),
  measurements: z.array(measurementSchema).max(48).optional(),
}).superRefine((input, context) => {
  const slots = input.measurements?.map((measurement) => measurement.slotNumber) ?? []
  if (new Set(slots).size !== slots.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'QC measurement slots must be unique' })
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await params
    return { sheet: await updateQcSheet(id, await readJson(request, schema), await requireActor()) }
  })
}
