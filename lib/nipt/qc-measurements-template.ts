import type { BatchDetail, QcSheet } from './types'
import { buildTaskSheetSampleCells, displayTemplateDate } from './task-sheet-template'

export interface QcMeasurementsTemplatePayload {
  selectedSheetName: 'QC measurements'
  sampleCells: ReturnType<typeof buildTaskSheetSampleCells>
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
    selectedSheetName: 'QC measurements',
    sampleCells: buildTaskSheetSampleCells(batch),
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
