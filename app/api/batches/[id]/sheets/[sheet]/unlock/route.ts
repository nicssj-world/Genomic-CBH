import { z } from 'zod'
import { requireAdmin } from '@/lib/server/auth'
import { unlockSheet } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ reason: z.string().trim().min(3).max(500) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string; sheet: string }> }) {
  return respond(async () => {
    const values = await params
    return { batch: await unlockSheet(values.id, Number(values.sheet), (await readJson(request, schema)).reason, await requireAdmin()) }
  })
}
