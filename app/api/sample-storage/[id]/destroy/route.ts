import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { destroySampleStorageBox } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ destroyedByName: z.string().trim().min(1).max(200) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await params
    const { destroyedByName } = await readJson(request, schema)
    return { storage: await destroySampleStorageBox(id, destroyedByName, await requireActor()) }
  })
}
