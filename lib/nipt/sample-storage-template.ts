import { BANGKOK_TIME_ZONE } from './rules'
import type { StorageBox } from './types'

export interface SampleStorageTemplatePayload {
  sheetName: 'Sheet1'
  sampleType: 'NIPT'
  startedAt: string
  destroyDueDate: string
  destroyedByName: string
  cells: Array<{
    address: string
    lnHalos: string
  }>
}

export function displayStorageTemplateDate(value: string | null) {
  if (!value) return ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+07:00`) : new Date(value)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('day')}/${get('month')}/${get('year')}`
}

export function getSampleStorageTemplateCell(position: string) {
  const match = /^([A-I])([1-9])$/.exec(position)
  if (!match) throw new Error(`Sample storage template position must be A1-I9: ${position}`)
  const row = match[1].charCodeAt(0) - 'A'.charCodeAt(0) + 8
  const column = String.fromCharCode('C'.charCodeAt(0) + Number(match[2]) - 1)
  return `${column}${row}`
}

export function buildSampleStorageTemplatePayload(box: StorageBox): SampleStorageTemplatePayload {
  return {
    sheetName: 'Sheet1',
    sampleType: 'NIPT',
    startedAt: displayStorageTemplateDate(box.startedAt),
    destroyDueDate: displayStorageTemplateDate(box.destroyDueDate),
    destroyedByName: box.destroyedByName ?? '',
    cells: [...box.slots]
      .sort((a, b) => a.slotNumber - b.slotNumber)
      .map((slot) => ({
        address: getSampleStorageTemplateCell(slot.position),
        lnHalos: slot.sample?.lnHalos ?? '',
      })),
  }
}
