import { describe, expect, it } from 'vitest'
import { buildRegistryLnWorkbook } from './registry-xlsx'

function storedFiles(zip: Buffer) {
  const result = new Map<string, string>()
  let offset = 0
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const byteLength = zip.readUInt32LE(offset + 18)
    const nameLength = zip.readUInt16LE(offset + 26)
    const extraLength = zip.readUInt16LE(offset + 28)
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString('utf8')
    const dataStart = offset + 30 + nameLength + extraLength
    result.set(name, zip.subarray(dataStart, dataStart + byteLength).toString('utf8'))
    offset = dataStart + byteLength
  }
  return result
}

describe('LN mapping Excel export', () => {
  it('builds a real XLSX with text IDs and both columns', () => {
    const workbook = buildRegistryLnWorkbook([
      { ln: '0028270019', lnHalos: '26B261012001' },
      { ln: '=SUM(1,1)', lnHalos: '26B261012002D' },
      { ln: '2&<3', lnHalos: 'A"B' },
    ])
    expect(workbook.readUInt32LE(0)).toBe(0x04034b50)
    const files = storedFiles(workbook)
    expect(files.has('[Content_Types].xml')).toBe(true)
    expect(files.has('xl/workbook.xml')).toBe(true)
    const sheet = files.get('xl/worksheets/sheet1.xml') ?? ''
    expect(sheet).toContain('r="A1" t="inlineStr"')
    expect(sheet).toContain('LN Halos')
    expect(sheet).toContain('0028270019')
    expect(sheet).toContain('26B261012002D')
    expect(sheet).toContain('=SUM(1,1)')
    expect(sheet).not.toContain('<f>')
    expect(sheet).toContain('2&amp;&lt;3')
    expect(sheet).toContain('A&quot;B')
    expect(sheet).toContain('<row r="4">')
    expect(workbook.readUInt32LE(workbook.length - 22)).toBe(0x06054b50)
  })

  it('preserves headers when no samples match', () => {
    const sheet = storedFiles(buildRegistryLnWorkbook([])).get('xl/worksheets/sheet1.xml') ?? ''
    expect(sheet).toContain('LN Halos')
    expect(sheet).not.toContain('<row r="2">')
  })

  it('exports all rows beyond the registry 50-row page', () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({ ln: String(i).padStart(10, '0'), lnHalos: '26B261012001' }))
    const sheet = storedFiles(buildRegistryLnWorkbook(rows)).get('xl/worksheets/sheet1.xml') ?? ''
    expect(sheet).toContain('<row r="1201">')
    expect(sheet).toContain('0000001199')
  })
})
