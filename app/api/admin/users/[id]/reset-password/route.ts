import { z } from 'zod'
import { requireAdmin } from '@/lib/server/auth'
import { resetUserPassword } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ password: z.string().min(8).max(128) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await resetUserPassword((await params).id, (await readJson(request, schema)).password, await requireAdmin())
    return { ok: true }
  })
}
