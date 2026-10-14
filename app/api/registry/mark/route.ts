import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { setRegistryPrintMarker } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ sampleId: z.string().uuid().nullable() })

export async function PATCH(request: Request) {
  return respond(async () => {
    const actor = await requireActor()
    return { marker: await setRegistryPrintMarker((await readJson(request, schema)).sampleId, actor) }
  })
}
