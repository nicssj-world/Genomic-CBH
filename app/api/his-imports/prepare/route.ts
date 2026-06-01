import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { prepareHisUpload } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive(),
  mimeType: z.string().max(150),
})

export async function POST(request: Request) {
  return respond(async () => {
    const input = await readJson(request, schema)
    return prepareHisUpload(input.fileName, input.fileSize, input.mimeType, await requireActor())
  })
}
