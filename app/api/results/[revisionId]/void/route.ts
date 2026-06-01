import { z } from 'zod'
import { requireAdmin } from '@/lib/server/auth'
import { voidResultRevision } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ reason: z.string().trim().min(3).max(500) })

export async function POST(request: Request, { params }: { params: Promise<{ revisionId: string }> }) {
  return respond(async () => {
    await voidResultRevision((await params).revisionId, (await readJson(request, schema)).reason, await requireAdmin())
    return { ok: true }
  })
}
