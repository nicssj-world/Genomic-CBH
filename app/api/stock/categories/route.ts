import { z } from 'zod'
import { requireAdmin } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { createStockCategory } from '@/lib/server/stock'

const schema = z.object({ name: z.string().trim().min(1).max(120) })

export async function POST(request: Request) {
  return respond(async () => ({ stock: await createStockCategory((await readJson(request, schema)).name, await requireAdmin()) }))
}
