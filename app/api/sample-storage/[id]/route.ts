import { requireActor } from '@/lib/server/auth'
import { deleteStorageBox } from '@/lib/server/data'
import { respond } from '@/lib/server/route'

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await params
    return { storage: await deleteStorageBox(id, await requireActor()) }
  })
}
