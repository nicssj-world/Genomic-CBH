import { z } from 'zod'
import { requireAdmin } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { createStockItem } from '@/lib/server/stock'

const schema = z.object({
  itemCode: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(180),
  categoryId: z.string().uuid(),
  unit: z.string().trim().min(1).max(60),
  minimumStock: z.number().min(0),
  trackLot: z.boolean(),
  trackExpiry: z.boolean(),
})

export async function POST(request: Request) {
  return respond(async () => ({ stock: await createStockItem(await readJson(request, schema), await requireAdmin()) }))
}
