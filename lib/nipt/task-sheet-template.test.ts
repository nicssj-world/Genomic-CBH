import { describe, expect, it } from 'vitest'
import { buildTaskSheetTemplatePayload } from './task-sheet-template'
import type { BatchDetail, BatchSlot, TaskSheet } from './types'

function sheet(sheetNumber: number, workDate: string): TaskSheet {
  return {
    id: `sheet-${sheetNumber}`,
    sheetNumber,
    workDate,
    operatorText: 'Operator',
    extractionLot: 'EXT-01',
    extractionExpiry: '2026-12-31',
    libraryLot: 'LIB-01',
    libraryExpiry: '2027-01-31',
    finalizedAt: null,
    finalizedByName: null,
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
      stage: 'Received',
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
    status: 'assembling',
    createdAt: '',
    sheets: [sheet(1, '2026-06-01'), sheet(2, '2026-06-02'), sheet(3, '2026-06-03')],
    slots: Array.from({ length: 48 }, (_, index) => slot(index + 1)),
  }
}

describe('Task List workbook template payload', () => {
  it('maps the selected sheet 16 slots into Run cells and gives controls their fixed -1 suffix', () => {
    const payload = buildTaskSheetTemplatePayload(batch(), 1)

    expect(payload.sampleCells).toHaveLength(16)
    // slot 1 (positive control) → left strip top cell
    expect(payload.sampleCells[0]).toEqual({ cell: 'B9', value: '26N120260601-1' })
    // slot 2 → next left-strip cell
    expect(payload.sampleCells[1]).toEqual({ cell: 'B10', value: '26B260601002-1' })
    // slot 9 → first right-strip cell
    expect(payload.sampleCells[8]).toEqual({ cell: 'H9', value: '26B260601009-1' })
    // slot 16 → last right-strip cell
    expect(payload.sampleCells[15]).toEqual({ cell: 'H16', value: '26B260601016-1' })
  })

  it('selects the exact workbook sheet name and formats template metadata', () => {
    const payload = buildTaskSheetTemplatePayload(batch(), 3)

    expect(payload.selectedSheetName).toBe('Ext. & Prep. Task List 3')
    expect(payload.metadata).toEqual({
      workDate: '03/06/2026',
      taskLabel: 'Run001/2026',
      operatorText: 'Operator',
      extractionInfo: 'EXT-01 / 31/12/2026',
      libraryInfo: 'LIB-01 / 31/01/2027',
      s1Label: 'Run001 S1-3/3',
      s2Label: 'Run001 S2-3/3',
    })
  })

  it('keeps specimen rerun suffixes independent from the fixed control suffix', () => {
    const rerunBatch = batch()
    const rerunSample = rerunBatch.slots[1].sample!
    rerunSample.runType = 'Re-Library'
    rerunSample.runSampleId = `${rerunSample.lnHalos}-2`

    const payload = buildTaskSheetTemplatePayload(rerunBatch, 1)

    expect(payload.sampleCells[0].value).toBe('26N120260601-1')
    expect(payload.sampleCells[1].value).toBe('26B260601002-2')
  })
})
