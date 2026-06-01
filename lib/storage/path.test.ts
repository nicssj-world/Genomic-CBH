import { describe, expect, it } from 'vitest'
import { isAllowedStorageKey, resolveStoragePath, safeFileName } from './path'

describe('local NAS storage paths', () => {
  it('allows app-owned storage folders', () => {
    expect(isAllowedStorageKey('his-imports/2026-06/file.csv')).toBe(true)
    expect(isAllowedStorageKey('qubit-imports/qc-sheet-1/qubit.csv')).toBe(true)
    expect(isAllowedStorageKey('results/26B260601005/rev-1-file.pdf')).toBe(true)
  })

  it('rejects path traversal and unsupported folders', () => {
    expect(isAllowedStorageKey('results/../secrets.txt')).toBe(false)
    expect(isAllowedStorageKey('results\\secrets.txt')).toBe(false)
    expect(isAllowedStorageKey('/results/file.pdf')).toBe(false)
    expect(isAllowedStorageKey('other/file.pdf')).toBe(false)
  })

  it('resolves a valid key under the configured root', () => {
    const path = resolveStoragePath('D:/nipt-storage', 'results/26B260601005/rev-1-file.pdf')
    expect(path.toLowerCase()).toContain('d:\\nipt-storage\\results\\26b260601005\\rev-1-file.pdf')
  })

  it('normalizes unsafe file name characters before keys are generated', () => {
    expect(safeFileName('ผลตรวจ final (1).pdf')).toBe('_______final__1_.pdf')
  })
})
