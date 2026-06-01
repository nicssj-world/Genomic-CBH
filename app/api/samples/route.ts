import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { listSamples, registerSample } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const registerSchema = z.object({ ln: z.string().trim().min(1).max(80) })

export async function GET(request: Request) {
  return respond(async () => {
    await requireActor()
    const search = new URL(request.url).searchParams.get('search') ?? undefined
    return { samples: await listSamples({ search }) }
  })
}

export async function POST(request: Request) {
  return respond(async () => registerSample((await readJson(request, registerSchema)).ln, await requireActor()))
}
