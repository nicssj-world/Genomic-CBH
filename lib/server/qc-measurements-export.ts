import 'server-only'

import { buildQcMeasurementsTemplatePayload } from '@/lib/nipt/qc-measurements-template'
import type { BatchDetail, QcSheet } from '@/lib/nipt/types'
import { queueExcelExport } from '@/lib/server/excel-export-queue'
import { renderApprovedExcelPdf } from '@/lib/server/excel-pdf-export'

export async function exportQcMeasurementsPdf(batch: BatchDetail, qcSheet: QcSheet) {
  return queueExcelExport(() => renderApprovedExcelPdf('qc-measurements', buildQcMeasurementsTemplatePayload(batch, qcSheet)))
}
