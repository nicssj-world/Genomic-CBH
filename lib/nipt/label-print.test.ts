import { describe, expect, it } from 'vitest'
import { buildTubeLabelsHtml } from './label-print'

const sample = { ln: 'LN2400123456', lnHalos: '26B261012001', patientName: null }

describe('tube label printing', () => {
  it('prints LN under LN Halos on all eight halves, preserving four stickers and suffixes', () => {
    const html = buildTubeLabelsHtml([sample])
    expect(html.match(/class="sticker"/g)).toHaveLength(4)
    expect(html.match(/class="patient-ln"/g)).toHaveLength(8)
    expect(html.match(/LN: LN2400123456/g)).toHaveLength(8)
    expect(html).toContain('26B261012001-1')
    expect(html).toContain('26B261012001-2')
    expect(html).toContain('26B261012001-3')
    expect(html).toMatch(/class="ln-halos">26B261012001-2<\/div>\s*<div class="patient-ln">LN: LN2400123456<\/div>/)
    expect(html).toContain('@page { size: 60mm 20mm; margin: 0; }')
    expect(html).toContain('width: 30mm; height: 20mm')
  })

  it('preserves patient name when provided and escapes untrusted text', () => {
    const html = buildTubeLabelsHtml([{
      ln: '<LN&123>',
      lnHalos: '26B261012001',
      patientName: '<Patient & Name>',
    }])
    expect(html).toContain('LN: &lt;LN&amp;123&gt;')
    expect(html).toContain('&lt;Patient &amp; Name&gt;')
    expect(html).not.toContain('<Patient & Name>')
  })

  it('does not copy LN from one sample to another', () => {
    const html = buildTubeLabelsHtml([sample, { ln: 'LN999', lnHalos: '26B261012002', patientName: null }])
    expect(html.match(/class="sticker"/g)).toHaveLength(8)
    expect(html.match(/LN: LN2400123456/g)).toHaveLength(8)
    expect(html.match(/LN: LN999/g)).toHaveLength(8)
  })
})
