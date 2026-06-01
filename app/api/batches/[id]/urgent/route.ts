import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { urgentFill } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ runId: z.string().uuid() })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => urgentFill((await params).id, (await readJson(request, schema)).runId, await requireActor()))
}
