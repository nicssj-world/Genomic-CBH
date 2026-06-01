import { requireActor } from '@/lib/server/auth'
import { getResultDownload } from '@/lib/server/data'
import { respond } from '@/lib/server/route'

export async function GET(_: Request, { params }: { params: Promise<{ revisionId: string }> }) {
  return respond(async () => {
    await requireActor()
    return { downloadUrl: await getResultDownload((await params).revisionId) }
  })
}
