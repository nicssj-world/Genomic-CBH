import { requireActor } from '@/lib/server/auth'
import { getResultFile } from '@/lib/server/data'
import { jsonError } from '@/lib/server/errors'
import { safeFileName } from '@/lib/server/storage'

export async function GET(_: Request, { params }: { params: Promise<{ revisionId: string }> }) {
  try {
    await requireActor()
    const result = await getResultFile((await params).revisionId)
    const fallbackName = safeFileName(result.fileName) || 'result.pdf'
    return new Response(new Blob([result.bytes]), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
        'Content-Length': String(result.bytes.byteLength),
        'Content-Type': 'application/pdf',
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
