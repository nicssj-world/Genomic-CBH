import { requireActor } from '@/lib/server/auth'
import { getBatch, logSheetExport } from '@/lib/server/data'
import { jsonError } from '@/lib/server/errors'
import { exportTaskSheetPdf } from '@/lib/server/task-sheet-export'

export const runtime = 'nodejs'

export async function GET(_: Request, { params }: { params: Promise<{ id: string; sheet: string }> }) {
  try {
    const values = await params
    const actor = await requireActor()
    const sheetNumber = Number(values.sheet)
    const batch = await getBatch(values.id)
    const bytes = await exportTaskSheetPdf(batch, sheetNumber)
    await logSheetExport(values.id, sheetNumber, actor)
    const fileName = `Ext-Prep-Task-List-${sheetNumber}_${batch.runLabel.replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`
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
