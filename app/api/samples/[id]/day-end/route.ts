import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { setIntakeDayEndMarker } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ marked: z.boolean() })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () =>
    setIntakeDayEndMarker((await params).id, (await readJson(request, schema)).marked, await requireActor()))
}
