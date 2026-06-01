import { requireActor } from '@/lib/server/auth'
import { autofillSampleStorage, getSampleStorage } from '@/lib/server/data'
import { respond } from '@/lib/server/route'

export async function GET() {
  return respond(async () => {
    await requireActor()
    return { storage: await getSampleStorage() }
  })
}

export async function POST() {
  return respond(async () => autofillSampleStorage(await requireActor()))
}
