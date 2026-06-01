import { z } from 'zod'
import { requireAdmin } from '@/lib/server/auth'
import { createUser, listUsers } from '@/lib/server/data'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  ephisId: z.string().regex(/^\d+$/),
  displayName: z.string().trim().min(1).max(120),
  role: z.enum(['Admin', 'CBH-Staff']),
  password: z.string().min(8).max(128),
})

export async function GET() {
  return respond(async () => {
    await requireAdmin()
    return { users: await listUsers() }
  })
}

export async function POST(request: Request) {
  return respond(async () => {
    const actor = await requireAdmin()
    return { id: await createUser(await readJson(request, schema), actor) }
  })
}
