import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { commitQubitUpload } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  key: z.string().startsWith('qubit-imports/'),
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive(),
  mimeType: z.string().max(150),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await params
    return { sheet: await commitQubitUpload(id, await readJson(request, schema), await requireActor()) }
  })
}
