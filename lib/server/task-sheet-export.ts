import 'server-only'

import type { BatchDetail } from '@/lib/nipt/types'
import { buildTaskSheetTemplatePayload } from '@/lib/nipt/task-sheet-template'
import { queueExcelExport } from '@/lib/server/excel-export-queue'
import { renderApprovedExcelPdf } from '@/lib/server/excel-pdf-export'

export async function exportTaskSheetPdf(batch: BatchDetail, sheetNumber: number) {
  return queueExcelExport(() => renderApprovedExcelPdf('task-list', buildTaskSheetTemplatePayload(batch, sheetNumber)))
}
