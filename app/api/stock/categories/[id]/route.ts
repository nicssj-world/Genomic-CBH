import { z } from 'zod'
import { requireAdmin } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { updateStockCategory } from '@/lib/server/stock'

const schema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, 'No changes provided')

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ stock: await updateStockCategory((await params).id, await readJson(request, schema), await requireAdmin()) }))
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ stock: await updateStockCategory((await params).id, { isActive: false }, await requireAdmin()) }))
}
