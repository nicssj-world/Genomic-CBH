import { formatControlCode } from './rules'
import type { BatchDetail } from './types'

export const TASK_SHEET_TEMPLATE_NAMES = {
  1: 'Ext. & Prep. Task List 1',
  2: 'Ext. & Prep. Task List 2',
  3: 'Ext. & Prep. Task List 3',
} as const

export type TaskSheetNumber = keyof typeof TASK_SHEET_TEMPLATE_NAMES

export interface TaskSheetTemplatePayload {
  sourceSheetName: string
  selectedSheetName: string
  sourceRows: Array<{
    sourceRow: number
    lnHalos: string
    printedSampleId: string
  }>
  metadata: {
    workDate: string
    taskLabel: string
    operatorText: string
    plasmaHandler: string
    extractionInfo: string
    libraryInfo: string
    s1Label: string
    s2Label: string
  }
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

export function buildTaskSheetSourceRows(batch: BatchDetail): TaskSheetTemplatePayload['sourceRows'] {
  const sheetMap = new Map(batch.sheets.map((sheet) => [sheet.sheetNumber, sheet]))
  return [...batch.slots]
    .sort((a, b) => a.slotNumber - b.slotNumber)
    .map((slot) => {
      const workDate = sheetMap.get(slot.sheetNumber)?.workDate ?? ''
      const controlCode = slot.controlType ? formatControlCode(slot.controlType, workDate) : ''
      return {
        sourceRow: slot.slotNumber + 2,
        lnHalos: controlCode || slot.sample?.lnHalos || '',
        printedSampleId: controlCode || slot.sample?.runSampleId || '',
      }
    })
}

export function buildTaskSheetTemplatePayload(batch: BatchDetail, sheetNumber: number): TaskSheetTemplatePayload {
  const selectedSheetNumber = requiredSheetNumber(sheetNumber)
  const selectedSheet = batch.sheets.find((sheet) => sheet.sheetNumber === selectedSheetNumber)
  if (!selectedSheet) throw new Error('Task List sheet not found')

  const runNumberLabel = batch.runLabel.split('/')[0] || batch.runLabel
  return {
    sourceSheetName: 'ใส่ข้อมูลตัวอย่าง ไม่ต้องปริ้น',
    selectedSheetName: TASK_SHEET_TEMPLATE_NAMES[selectedSheetNumber],
    sourceRows: buildTaskSheetSourceRows(batch),
    metadata: {
      workDate: displayTemplateDate(selectedSheet.workDate),
      taskLabel: batch.runLabel,
      operatorText: selectedSheet.operatorText ?? '',
      plasmaHandler: selectedSheet.plasmaHandler ?? '',
      extractionInfo: lotAndExpiry(selectedSheet.extractionLot, selectedSheet.extractionExpiry),
      libraryInfo: lotAndExpiry(selectedSheet.libraryLot, selectedSheet.libraryExpiry),
      s1Label: `${runNumberLabel} S1-${selectedSheetNumber}/3`,
      s2Label: `${runNumberLabel} S2-${selectedSheetNumber}/3`,
    },
  }
}
