import type { SampleRow } from '@/lib/nipt/types'

function half(ln: string, name: string, isRight: boolean): string {
  return `<div class="${isRight ? 'right' : 'left'} half">
    <div class="ln">${ln}</div>
    <div class="name">${name}</div>
  </div>`
}

function sticker(l: string, r: string, name: string): string {
  return `<div class="sticker">${half(l, name, false)}${half(r, name, true)}</div>`
}

export function printTubeLabels(samples: SampleRow[]): void {
  const body = samples.flatMap((sample) => {
    const b = sample.lnHalos
    const name = sample.patientName ?? ''
    return [sticker(b, b, name), sticker(b, b, name), sticker(b, `${b}-1`, name), sticker(`${b}-2`, `${b}-3`, name)]
  }).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: 60mm 20mm; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', Courier, monospace; }
    .sticker { width: 60mm; height: 20mm; display: flex; page-break-after: always; overflow: hidden; }
    .sticker:last-child { page-break-after: auto; }
    .half { width: 30mm; height: 20mm; display: flex; flex-direction: column; justify-content: center; gap: 1.5mm; padding: 2mm 1.5mm 2mm 7mm; }
    .right { border-left: 0.5px dashed #555; padding-left: 4mm; padding-right: 3mm; }
    .ln { font-size: 7pt; font-weight: 900; letter-spacing: -0.02em; line-height: 1; white-space: nowrap; }
    .name { font-size: 5pt; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  </style></head><body>${body}</body></html>`

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print() }, 250)
}
