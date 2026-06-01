import { z } from 'zod'
import { requireAdmin } from '@/lib/server/auth'
import { updateUser } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  role: z.enum(['Admin', 'CBH-Staff']).optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await updateUser((await params).id, await readJson(request, schema), await requireAdmin())
    return { ok: true }
  })
}
