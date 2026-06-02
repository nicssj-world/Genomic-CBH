import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { reverseStockMovement } from '@/lib/server/stock'

const schema = z.object({ reason: z.string().trim().min(1).max(500) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ stock: await reverseStockMovement((await params).id, (await readJson(request, schema)).reason, await requireActor()) }))
}
