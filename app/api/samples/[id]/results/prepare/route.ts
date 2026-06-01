import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { prepareResultUpload } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive(),
  mimeType: z.literal('application/pdf'),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const input = await readJson(request, schema)
    return prepareResultUpload((await params).id, input.fileName, input.fileSize, input.mimeType, await requireActor())
  })
}
