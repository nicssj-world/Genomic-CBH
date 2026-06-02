import { describe, expect, it } from 'vitest'
import { buildSampleStorageTemplatePayload, displayStorageTemplateDate, getSampleStorageTemplateCell } from './sample-storage-template'
import type { StorageBox } from './types'

function box(): StorageBox {
  return {
    id: 'box-1',
    boxNumber: 1,
    boxYear: 2026,
    boxLabel: 'Box001/2026',
    status: 'filling',
    startedAt: '2026-06-02T17:30:00.000Z',
    filledAt: null,
    destroyDueDate: null,
    destroyedAt: null,
    destroyedByName: null,
    destroyedRecordedByName: null,
    slots: Array.from({ length: 81 }, (_, index) => {
      const slotNumber = index + 1
      const position = `${'ABCDEFGHI'[index % 9]}${Math.floor(index / 9) + 1}`
      return {
        id: `slot-${slotNumber}`,
        slotNumber,
        position,
        storedAt: slotNumber === 1 ? '2026-06-02T17:30:00.000Z' : null,
        sample: slotNumber === 1 ? {
          id: 'sample-1',
          ln: '2614010818',
          lnHalos: '26B260602001',
          patientName: null,
          importedAt: '2026-06-02T16:00:00.000Z',
        } : null,
      }
    }),
  }
}

describe('Sample Storage workbook template payload', () => {
  it('maps A1-I9 positions into the approved 9x9 region of the original 10x10 form', () => {
    expect(getSampleStorageTemplateCell('A1')).toBe('C8')
    expect(getSampleStorageTemplateCell('I1')).toBe('C16')
    expect(getSampleStorageTemplateCell('A2')).toBe('D8')
    expect(getSampleStorageTemplateCell('I9')).toBe('K16')
    expect(() => getSampleStorageTemplateCell('J10')).toThrow()
  })

  it('builds a values-only payload with LN Halos values and Bangkok dates', () => {
    const payload = buildSampleStorageTemplatePayload(box())

    expect(payload.sheetName).toBe('Sheet1')
    expect(payload.sampleType).toBe('NIPT')
    expect(payload.startedAt).toBe('03/06/2026')
    expect(payload.destroyDueDate).toBe('')
    expect(payload.cells).toHaveLength(81)
    expect(payload.cells[0]).toEqual({ address: 'C8', lnHalos: '26B260602001' })
    expect(payload.cells[80]).toEqual({ address: 'K16', lnHalos: '' })
  })

  it('formats plain destroy due dates without shifting the Bangkok day', () => {
    expect(displayStorageTemplateDate('2028-06-03')).toBe('03/06/2028')
  })
})
