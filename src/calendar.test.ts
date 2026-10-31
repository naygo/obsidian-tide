import { describe, expect, it } from 'vitest'
import { monthWeeks, shiftMonth } from './calendar'

describe('monthWeeks', () => {
  it('gives the ISO weeks of the month, Monday first, with the days of the months around it', () => {
    const weeks = monthWeeks('2026-10')
    expect(weeks.map((w) => w.week)).toEqual(['2026-W40', '2026-W41', '2026-W42', '2026-W43', '2026-W44'])
    expect(weeks[0].days).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ])
    expect(weeks[4].days[6]).toBe('2026-11-01')
  })

  it('names a week at the turn of the year by its ISO year', () => {
    const weeks = monthWeeks('2027-01')
    expect(weeks[0]).toEqual({
      week: '2026-W53',
      days: ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'],
    })
    expect(
      monthWeeks('2024-12')
        .map((w) => w.week)
        .pop(),
    ).toBe('2025-W01')
  })

  it('starts on the 1st when the month starts on a Monday', () => {
    expect(monthWeeks('2026-06')[0].days[0]).toBe('2026-06-01')
  })
})

describe('shiftMonth', () => {
  it('goes back and forth across the year', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-10', 0)).toBe('2026-10')
  })
})
