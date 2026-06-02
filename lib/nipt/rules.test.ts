import { describe, expect, it } from 'vitest'
import {
  formatControlCode,
  formatGestationalAge,
  formatLnHalos,
  formatRunSampleId,
  getStorageDueState,
  getStoragePosition,
  getPlatePosition,
  getSheetNumber,
  isGestationalAgeComplete,
  isGestationalAgeWarning,
} from './rules'

describe('LN Halos formatting', () => {
  it('uses the Bangkok calendar date and a zero-padded daily sequence', () => {
    expect(formatLnHalos(5, new Date('2026-05-31T17:00:00.000Z'))).toBe('26B260601005')
  })

  it('changes the date portion when the Bangkok day changes', () => {
    expect(formatLnHalos(5, new Date('2026-05-31T16:59:59.000Z'))).toBe('26B260531005')
    expect(formatLnHalos(1, new Date('2026-05-31T17:00:00.000Z'))).toBe('26B260601001')
  })

  it('rejects sequences outside the three-digit range', () => {
    expect(() => formatLnHalos(0)).toThrow()
    expect(() => formatLnHalos(1000)).toThrow()
  })
})

describe('sample storage box rules', () => {
  it('maps 81 storage slots into a 9x9 A1-I9 grid', () => {
    expect(getStoragePosition(1)).toBe('A1')
    expect(getStoragePosition(9)).toBe('I1')
    expect(getStoragePosition(10)).toBe('A2')
    expect(getStoragePosition(81)).toBe('I9')
    expect(() => getStoragePosition(82)).toThrow()
  })

  it('warns during the final 90 days and marks due or overdue boxes', () => {
    expect(getStorageDueState(null, '2026-06-01')).toEqual({ state: 'not-started', daysRemaining: null })
    expect(getStorageDueState('2026-09-01', '2026-06-01')).toEqual({ state: 'scheduled', daysRemaining: 92 })
    expect(getStorageDueState('2026-08-30', '2026-06-01')).toEqual({ state: 'due-soon', daysRemaining: 90 })
    expect(getStorageDueState('2026-06-01', '2026-06-01')).toEqual({ state: 'due', daysRemaining: 0 })
    expect(getStorageDueState('2026-05-31', '2026-06-01')).toEqual({ state: 'overdue', daysRemaining: -1 })
  })
})

describe('sample workflow formatting', () => {
  it('maps rerun suffixes without changing the B marker', () => {
    expect(formatRunSampleId('26B260601005', 'Normal')).toBe('26B260601005-1')
    expect(formatRunSampleId('26B260601005', 'Re-Library')).toBe('26B260601005-2')
    expect(formatRunSampleId('26B260601005', 'Re-Sampling')).toBe('26B260601005-3')
  })

  it('formats and highlights gestational age', () => {
    expect(formatGestationalAge(16, 3)).toBe('16W 3D')
    expect(formatGestationalAge(null, null)).toBe('-')
    expect(formatGestationalAge(12, null)).toBe('12W ?D')
    expect(formatGestationalAge(null, 3)).toBe('?W 3D')
    expect(isGestationalAgeComplete(null, null)).toBe(true)
    expect(isGestationalAgeComplete(16, 3)).toBe(true)
    expect(isGestationalAgeComplete(12, null)).toBe(false)
    expect(isGestationalAgeWarning(21)).toBe(false)
    expect(isGestationalAgeWarning(22)).toBe(true)
  })
})

describe('task list controls and positions', () => {
  it('formats fixed control codes from each sheet work date', () => {
    expect(formatControlCode('positive', '2026-06-01')).toBe('26N120260601')
    expect(formatControlCode('negative', '2026-06-01')).toBe('26N220260601')
    expect(formatControlCode('blank', '2026-06-01')).toBe('26N320260601')
  })

  it('maps plate positions across three task sheets', () => {
    expect(getPlatePosition(1)).toBe('A1')
    expect(getPlatePosition(8)).toBe('H1')
    expect(getPlatePosition(9)).toBe('A2')
    expect(getPlatePosition(48)).toBe('H6')
    expect(getSheetNumber(16)).toBe(1)
    expect(getSheetNumber(17)).toBe(2)
    expect(getSheetNumber(33)).toBe(3)
  })
})
