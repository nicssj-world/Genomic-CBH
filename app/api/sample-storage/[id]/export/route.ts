import { requireActor } from '@/lib/server/auth'
import { getSampleStorageBox, logSampleStorageExport } from '@/lib/server/data'
import { jsonError } from '@/lib/server/errors'
import { exportSampleStoragePdf } from '@/lib/server/sample-storage-export'

export const runtime = 'nodejs'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const actor = await requireActor()
    const box = await getSampleStorageBox(id)
    const bytes = await exportSampleStoragePdf(box)
    await logSampleStorageExport(id, actor)
    const fileName = `Sample-Storage_${box.boxLabel.replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`
    return new Response(new Blob([bytes]), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(bytes.byteLength),
        'Content-Type': 'application/pdf',
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
