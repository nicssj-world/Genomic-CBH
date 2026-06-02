import { describe, expect, it } from 'vitest'
import { encodeStockCsv } from './stock-csv'

describe('Stock CSV', () => {
  it('adds an Excel-friendly UTF-8 BOM and escapes commas, quotes, and Thai text', () => {
    const csv = encodeStockCsv([
      ['สินค้า', 'หมายเหตุ'],
      ['น้ำยา, NIPT', 'เก็บใน "ตู้เย็น"'],
    ])

    expect(csv.charCodeAt(0)).toBe(0xFEFF)
    expect(csv).toContain('"น้ำยา, NIPT"')
    expect(csv).toContain('"เก็บใน ""ตู้เย็น"""')
    expect(csv).toContain('\r\n')
  })
})
