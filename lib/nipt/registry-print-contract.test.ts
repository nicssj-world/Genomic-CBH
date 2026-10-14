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

  it('auto-marks only first current Bangkok-day registration, preserves manual overrides, and audits', () => {
    const sql = read('supabase/migrations/202610150002_genomic_auto_first_intake_mark.sql')
    expect(sql).toContain('AFTER INSERT ON public.nipt_samples')
    expect(sql).toContain("NEW.imported_at AT TIME ZONE 'Asia/Bangkok'")
    expect(sql).toContain('previous.id <> NEW.id')
    expect(sql).toContain('auto_evaluated_date = v_day')
    expect(sql).toContain("v_source = 'MANUAL'")
    expect(sql).toContain("mark_source = 'AUTO'")
    expect(sql).toContain("mark_source = CASE WHEN p_sample IS NOT NULL THEN 'MANUAL' ELSE NULL END")
    expect(sql).toContain('registry.print_marker.auto')
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.register_nipt_sample')
    const registry = read('components/patients-view.tsx')
    expect(registry).toContain('Auto Mark')
    expect(registry).toContain('Manual Mark')
    expect(registry).toContain("marker.source === 'MANUAL' ? null : sample.id")
  })
})
