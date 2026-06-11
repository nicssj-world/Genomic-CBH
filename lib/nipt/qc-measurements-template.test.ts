import { describe, expect, it } from 'vitest'
import type { BatchDetail, BatchSlot, QcSheet, TaskSheet } from './types'
import { buildQcMeasurementsTemplatePayload } from './qc-measurements-template'

function taskSheet(sheetNumber: number): TaskSheet {
  return {
    id: `task-sheet-${sheetNumber}`,
    sheetNumber,
    workDate: `2026-06-0${sheetNumber}`,
    operatorText: `Operator ${sheetNumber}`,
    plasmaHandler: null,
    extractionLot: null,
    extractionExpiry: null,
    libraryLot: null,
    libraryExpiry: null,
    finalizedAt: '2026-06-03T10:00:00.000Z',
    finalizedByName: 'Admin',
    revisionNumber: 1,
  }
}

function slot(slotNumber: number): BatchSlot {
  const controlType = slotNumber === 1 ? 'positive' : slotNumber === 25 ? 'negative' : slotNumber === 40 ? 'blank' : null
  return {
    id: `slot-${slotNumber}`,
    slotNumber,
    platePosition: '',
    sheetNumber: slotNumber <= 16 ? 1 : slotNumber <= 32 ? 2 : 3,
    controlType,
    sampleRunId: controlType ? null : `run-${slotNumber}`,
    sample: controlType ? null : {
      id: `sample-${slotNumber}`,
      ln: `LN-${slotNumber}`,
      lnHalos: `26B260601${String(slotNumber).padStart(3, '0')}`,
      importedAt: '',
      importedByName: null,
      gaWeeks: null,
      gaDays: null,
      patientName: null,
      idPassport: null,
      hn: null,
      dob: null,
      doctor: null,
      collectionDate: null,
      receivedDate: null,
      runId: `run-${slotNumber}`,
      runType: 'Normal',
      stage: 'Extract',
      pregnancyType: 'Single',
      runSampleId: `26B260601${String(slotNumber).padStart(3, '0')}-1`,
    },
  }
}

function batch(): BatchDetail {
  return {
    id: 'batch-1',
    runNumber: 1,
    runYear: 2026,
    runLabel: 'Run001/2026',
    status: 'extract',
    createdAt: '',
    sheets: [taskSheet(1), taskSheet(2), taskSheet(3)],
    slots: Array.from({ length: 48 }, (_, index) => slot(index + 1)),
  }
}

function qcSheet(): QcSheet {
  return {
    id: 'qc-sheet-1',
    batchId: 'batch-1',
    runLabel: 'Run001/2026',
    ready: true,
    workDate: '2026-06-04',
    operatorText: 'QC Operator',
    createdAt: '',
    imports: [],
    measurements: Array.from({ length: 48 }, (_, index) => ({
      id: `measurement-${index + 1}`,
      batchSlotId: `slot-${index + 1}`,
      slotNumber: index + 1,
      printedSampleId: '',
      controlType: null,
      concentration: index === 0 ? 2.56 : null,
      updatedAt: '',
    })),
  }
}

describe('QC Measurements workbook template payload', () => {
  it('maps the original 48 Task List slots and keeps the fixed -1 control suffix', () => {
    const payload = buildQcMeasurementsTemplatePayload(batch(), qcSheet())

    expect(payload.sourceRows).toHaveLength(48)
    expect(payload.sourceRows[0]).toEqual({ sourceRow: 3, lnHalos: '26N120260601', printedSampleId: '26N120260601-1' })
    expect(payload.sourceRows[24]).toEqual({ sourceRow: 27, lnHalos: '26N220260602', printedSampleId: '26N220260602-1' })
    expect(payload.sourceRows[39]).toEqual({ sourceRow: 42, lnHalos: '26N320260603', printedSampleId: '26N320260603-1' })
  })

  it('fills only the QC metadata and concentration row addresses required by the approved sheet', () => {
    const payload = buildQcMeasurementsTemplatePayload(batch(), qcSheet())

    expect(payload.selectedSheetName).toBe('QC measurements')
    expect(payload.metadata).toEqual({ workDate: '04/06/2026', operatorText: 'QC Operator' })
    expect(payload.measurements).toHaveLength(48)
    expect(payload.measurements[0]).toEqual({ targetRow: 7, concentration: 2.56 })
    expect(payload.measurements[47]).toEqual({ targetRow: 54, concentration: null })
  })
})
