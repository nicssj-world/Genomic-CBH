import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { listRegistrySamples } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

// POST keeps patient names/LN searches out of URL query parameters and access logs.
const schema = z.object({
  page: z.number().int().min(1).max(1000000).default(1),
  search: z.string().max(80).optional(),
})

export async function POST(request: Request) {
  return respond(async () => {
    await requireActor()
    return listRegistrySamples(await readJson(request, schema))
  })
}
