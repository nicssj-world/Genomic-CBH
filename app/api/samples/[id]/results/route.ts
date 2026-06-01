import { z } from 'zod'
import { requireActor, requireAdmin } from '@/lib/server/auth'
import { commitResultUpload, listResultRevisions } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  key: z.string().startsWith('results/'),
  revisionNumber: z.number().int().positive(),
  fileName: z.string().trim().min(1).max(255).refine((value) => value.toLowerCase().endsWith('.pdf'), 'Result must be a PDF'),
  fileSize: z.number().int().positive(),
})

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await requireAdmin()
    return { revisions: await listResultRevisions((await params).id) }
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ result: await commitResultUpload((await params).id, await readJson(request, schema), await requireActor()) }))
}
