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


  it('adds the issued three-digit LN Halos sequence to all four corners of each half', () => {
    const html = buildTubeLabelsHtml([sample])
    expect(html.match(/class="corner-set" aria-hidden="true"/g)).toHaveLength(8)
    expect(html.match(/class="corner (?:tl|tr|bl|br)">001<\/span>/g)).toHaveLength(32)
    for (const corner of ['tl', 'tr', 'bl', 'br']) {
      expect(html.match(new RegExp(`class="corner ${corner}">001<\\/span>`, 'g'))).toHaveLength(8)
    }
    expect(html).toContain('font-size: 6.5pt')
    expect(html).toContain('.left .corner.tr, .left .corner.br { right: 1.2mm; }')
    expect(html).toContain('.right .corner.tl, .right .corner.bl { left: 1.2mm; }')
    expect(html).toContain('@page { size: 60mm 20mm; margin: 0; }')
    expect(html).toContain('width: 30mm; height: 20mm')
    expect(html).toContain('.ln-halos { font-size: 7pt;')
    expect(html).toContain('.patient-ln { font-size: 6pt;')
  })

  it('takes corner digits from the base code, not tube suffixes or twin D', () => {
    const html = buildTubeLabelsHtml([
      { ln: 'FIRST', lnHalos: '26B261014011', patientName: null },
      { ln: 'TWIN', lnHalos: '26B261014042D', patientName: null },
    ])
    expect(html.match(/class="corner tl">011<\/span>/g)).toHaveLength(8)
    expect(html.match(/class="corner tl">042<\/span>/g)).toHaveLength(8)
    expect(html).toContain('26B261014011-3')
    expect(html).toContain('26B261014042D-3')
    expect(html).not.toContain('class="corner tl">-3')
  })

  it('keeps original label content and no fake digits when LN Halos is invalid', () => {
    const html = buildTubeLabelsHtml([
      { ln: '<LN&123>', lnHalos: 'INVALID', patientName: '<Name>' },
    ])
    expect(html).not.toContain('class="corner-set"')
    expect(html).toContain('LN: &lt;LN&amp;123&gt;')
    expect(html).toContain('&lt;Name&gt;')
    expect(html.match(/class="sticker"/g)).toHaveLength(4)
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
