import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { commitHisUpload, listHisImports } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  key: z.string().startsWith('his-imports/'),
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive(),
  mimeType: z.string().max(150),
})

export async function GET() {
  return respond(async () => {
    await requireActor()
    return { imports: await listHisImports() }
  })
}

export async function POST(request: Request) {
  return respond(async () => ({ import: await commitHisUpload(await readJson(request, schema), await requireActor()) }))
}
