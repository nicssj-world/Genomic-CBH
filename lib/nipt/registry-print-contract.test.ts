import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('Genomic registry owner lock', () => {
  it('stores only one global mark with serialized audited replacement', () => {
    const migration = read('supabase/migrations/202610150001_genomic_manual_label_mark.sql')
    expect(migration).toContain('singleton_id boolean PRIMARY KEY')
    expect(migration).toContain('FOR UPDATE')
    expect(migration).toContain('SET sample_id = p_sample')
    expect(migration).toContain('previous_sample_id')
    expect(migration).toContain('next_sample_id')
    expect(migration).toContain('ON DELETE SET NULL')
  })

  it('limits only the registry to 50 rows with stable ordering and full search', () => {
    const server = read('lib/server/data.ts')
    expect(server).toContain('const pageSize = 50')
    expect(server).toContain(".order('imported_at', { ascending: false }).order('id', { ascending: false })")
    expect(server).toContain('options.limit ?? 250')
    expect(server).toContain('ln_halos.ilike.%')
    expect(server).toContain('listSamples({ limit: 1000 })')
  })

  it('keeps manual Mark outside the shared print modal and shows both identifiers', () => {
    const registry = read('components/patients-view.tsx')
    const modal = read('components/print-labels-modal.tsx')
    const html = read('lib/nipt/label-print.ts')
    expect(registry).toContain('setMark(marker?.sampleId === sample.id ? null : sample.id)')
    expect(registry).toContain('showPrintModal')
    expect(modal).toContain('LN Halos: {p.lnHalos}')
    expect(modal).toContain('LN HIS: {p.ln}')
    expect(modal).toContain('printTubeLabels(selectedPatients)')
    expect(modal).not.toContain('setMark(')
    expect(html).toContain('@page { size: 60mm 20mm; margin: 0; }')
    expect(html).toContain('sticker(code, code, ln, name)')
  })
})
