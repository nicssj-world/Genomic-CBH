import { requireActor } from '@/lib/server/auth'
import { finalizeSheet } from '@/lib/server/data'
import { respond } from '@/lib/server/route'

export async function POST(_: Request, { params }: { params: Promise<{ id: string; sheet: string }> }) {
  return respond(async () => {
    const values = await params
    return { batch: await finalizeSheet(values.id, Number(values.sheet), await requireActor()) }
  })
}
