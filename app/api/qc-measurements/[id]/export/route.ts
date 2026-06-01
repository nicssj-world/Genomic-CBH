import { requireActor } from '@/lib/server/auth'
import { getQcExportData, logQcSheetExport } from '@/lib/server/data'
import { jsonError } from '@/lib/server/errors'
import { exportQcMeasurementsPdf } from '@/lib/server/qc-measurements-export'

export const runtime = 'nodejs'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const actor = await requireActor()
    const { batch, qcSheet } = await getQcExportData(id)
    const bytes = await exportQcMeasurementsPdf(batch, qcSheet)
    await logQcSheetExport(id, actor)
    const fileName = `QC-measurements_${batch.runLabel.replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`
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
