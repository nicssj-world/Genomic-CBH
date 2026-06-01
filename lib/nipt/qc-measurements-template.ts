import type { BatchDetail, QcSheet } from './types'
import { buildTaskSheetSourceRows, displayTemplateDate } from './task-sheet-template'

export interface QcMeasurementsTemplatePayload {
  sourceSheetName: string
  selectedSheetName: 'QC measurements'
  sourceRows: ReturnType<typeof buildTaskSheetSourceRows>
  metadata: {
    workDate: string
    operatorText: string
  }
  measurements: Array<{
    targetRow: number
    concentration: number | null
  }>
}

export function buildQcMeasurementsTemplatePayload(batch: BatchDetail, qcSheet: QcSheet): QcMeasurementsTemplatePayload {
  if (batch.id !== qcSheet.batchId) throw new Error('QC sheet batch does not match extraction batch')
  return {
    sourceSheetName: 'ใส่ข้อมูลตัวอย่าง ไม่ต้องปริ้น',
    selectedSheetName: 'QC measurements',
    sourceRows: buildTaskSheetSourceRows(batch),
    metadata: {
      workDate: displayTemplateDate(qcSheet.workDate),
      operatorText: qcSheet.operatorText ?? '',
    },
    measurements: [...qcSheet.measurements]
      .sort((a, b) => a.slotNumber - b.slotNumber)
      .map((measurement) => ({
        targetRow: measurement.slotNumber + 6,
        concentration: measurement.concentration,
      })),
  }
}
