import 'server-only'

import { buildSampleStorageTemplatePayload } from '@/lib/nipt/sample-storage-template'
import type { StorageBox } from '@/lib/nipt/types'
import { queueExcelExport } from '@/lib/server/excel-export-queue'
import { renderApprovedExcelPdf } from '@/lib/server/excel-pdf-export'

export async function exportSampleStoragePdf(box: StorageBox) {
  return queueExcelExport(() => renderApprovedExcelPdf('sample-storage', buildSampleStorageTemplatePayload(box)))
}
