import { requireActor } from '@/lib/server/auth'
import { createBatch, getCurrentBatch } from '@/lib/server/data'
import { respond } from '@/lib/server/route'

export async function GET() {
  return respond(async () => {
    await requireActor()
    return { batch: await getCurrentBatch() }
  })
}

export async function POST() {
  return respond(async () => ({ batch: await createBatch(await requireActor()) }))
}
