import { formatControlCode } from './rules'
import type { BatchDetail } from './types'

export const TASK_SHEET_TEMPLATE_NAMES = {
  1: 'Ext. & Prep. Task List 1',
  2: 'Ext. & Prep. Task List 2',
  3: 'Ext. & Prep. Task List 3',
} as const

export type TaskSheetNumber = keyof typeof TASK_SHEET_TEMPLATE_NAMES

export interface TaskSheetTemplatePayload {
  selectedSheetName: string
  sampleCells: Array<{
    cell: string
    value: string
  }>
  metadata: {
    workDate: string
    taskLabel: string
    operatorText: string
    extractionInfo: string
    libraryInfo: string
    s1Label: string
    s2Label: string
  }
}

// Maps a global slot number (1-48) to the Task List sheet and the top-left cell
// of its "Run" sample-ID block. Left strip (positions 1-8) → B9:B16, right strip
// (positions 9-16) → H9:H16. The pre-printed "Barcode" columns are left untouched.
export function taskListSlotCell(slotNumber: number): { sheetNumber: TaskSheetNumber; cell: string } {
  const sheetNumber = Math.ceil(slotNumber / 16) as TaskSheetNumber
  const local = slotNumber - (sheetNumber - 1) * 16
  const cell = local <= 8 ? `B${local + 8}` : `H${local}`
  return { sheetNumber, cell }
}

// Sample-ID writes for the whole batch, addressed by sheet + cell. QC export uses
// this to populate all three Task List sheets so the QC sheet formulas resolve.
export function buildTaskSheetSampleCells(batch: BatchDetail): Array<{ sheetName: string; cell: string; value: string }> {
  return buildTaskSheetSourceRows(batch).map((row) => {
    const { sheetNumber, cell } = taskListSlotCell(row.sourceRow - 2)
    return { sheetName: TASK_SHEET_TEMPLATE_NAMES[sheetNumber], cell, value: row.printedSampleId }
  })
}

function requiredSheetNumber(value: number): TaskSheetNumber {
  if (value !== 1 && value !== 2 && value !== 3) throw new Error('Task List sheet must be 1, 2, or 3')
  return value
}

export function displayTemplateDate(isoDate: string | null) {
  if (!isoDate) return ''
  const [year, month, day] = isoDate.split('-')
  return year && month && day ? `${day}/${month}/${year}` : isoDate
}

function lotAndExpiry(lot: string | null, expiry: string | null) {
  return [lot, displayTemplateDate(expiry)].filter(Boolean).join(' / ')
}

export function buildTaskSheetSourceRows(batch: BatchDetail): Array<{ sourceRow: number; lnHalos: string; printedSampleId: string }> {
  const sheetMap = new Map(batch.sheets.map((sheet) => [sheet.sheetNumber, sheet]))
  return [...batch.slots]
    .sort((a, b) => a.slotNumber - b.slotNumber)
    .map((slot) => {
      const workDate = sheetMap.get(slot.sheetNumber)?.workDate ?? ''
      const controlCode = slot.controlType ? formatControlCode(slot.controlType, workDate) : ''
      return {
        sourceRow: slot.slotNumber + 2,
        lnHalos: controlCode || slot.sample?.lnHalos || '',
        printedSampleId: controlCode ? `${controlCode}-1` : slot.sample?.runSampleId || '',
      }
    })
}

export function buildTaskSheetTemplatePayload(batch: BatchDetail, sheetNumber: number): TaskSheetTemplatePayload {
  const selectedSheetNumber = requiredSheetNumber(sheetNumber)
  const selectedSheet = batch.sheets.find((sheet) => sheet.sheetNumber === selectedSheetNumber)
  if (!selectedSheet) throw new Error('Task List sheet not found')

  const selectedSheetName = TASK_SHEET_TEMPLATE_NAMES[selectedSheetNumber]
  const sampleCells = buildTaskSheetSampleCells(batch)
    .filter((entry) => entry.sheetName === selectedSheetName)
    .map(({ cell, value }) => ({ cell, value }))
  const runNumberLabel = batch.runLabel.split('/')[0] || batch.runLabel
  return {
    selectedSheetName,
    sampleCells,
    metadata: {
      workDate: displayTemplateDate(selectedSheet.workDate),
      taskLabel: batch.runLabel,
      operatorText: selectedSheet.operatorText ?? '',
      extractionInfo: lotAndExpiry(selectedSheet.extractionLot, selectedSheet.extractionExpiry),
      libraryInfo: lotAndExpiry(selectedSheet.libraryLot, selectedSheet.libraryExpiry),
      s1Label: `${runNumberLabel} S1-${selectedSheetNumber}/3`,
      s2Label: `${runNumberLabel} S2-${selectedSheetNumber}/3`,
    },
  }
}
