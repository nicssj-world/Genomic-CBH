import { z } from 'zod'
import { requireAdmin } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { updateStockItem } from '@/lib/server/stock'

const schema = z.object({
  itemCode: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(180).optional(),
  categoryId: z.string().uuid().optional(),
  unit: z.string().trim().min(1).max(60).optional(),
  minimumStock: z.number().min(0).optional(),
  trackLot: z.boolean().optional(),
  trackExpiry: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, 'No changes provided')

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ stock: await updateStockItem((await params).id, await readJson(request, schema), await requireAdmin()) }))
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ stock: await updateStockItem((await params).id, { isActive: false }, await requireAdmin()) }))
}
