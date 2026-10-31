import { describe, expect, it } from 'vitest'
import { looseIn, monthDays, monthWeeks, shiftMonth, yearWeeks } from './calendar'
import type { Place } from './ladder'
import type { ListedTask } from './list'
import { parseBlock } from './org'

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

describe('monthDays', () => {
  it('gives every day of the month and none of the months around it', () => {
    const days = monthDays('2026-10')
    expect(days).toHaveLength(31)
    expect(days[0]).toBe('2026-10-01')
    expect(days[30]).toBe('2026-10-31')
  })

  it('ends February on the 28th, or the 29th in a leap year', () => {
    expect(monthDays('2026-02').pop()).toBe('2026-02-28')
    expect(monthDays('2028-02').pop()).toBe('2028-02-29')
  })
})

describe('yearWeeks', () => {
  it('gives the days of the year in columns from Monday, null outside the year', () => {
    const weeks = yearWeeks('2026')
    expect(weeks).toHaveLength(53)
    expect(weeks[0]).toEqual([null, null, null, '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'])
    expect(weeks[52]).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', null, null, null])
    expect(weeks.flat().filter(Boolean)).toHaveLength(365)
  })

  it('takes a 54th column for a leap year that starts on a Sunday', () => {
    const weeks = yearWeeks('2012')
    expect(weeks).toHaveLength(54)
    expect(weeks[0][6]).toBe('2012-01-01')
    expect(weeks[53][0]).toBe('2012-12-31')
    expect(weeks.flat().filter(Boolean)).toHaveLength(366)
  })
})

describe('looseIn', () => {
  const task = (lines: string[], home: Place | null): ListedTask => ({
    path: 'x.md',
    line: 0,
    head: lines[0],
    block: parseBlock(lines)!,
    home,
  })
  const month: Place = { kind: 'month', key: '2026-10' }

  it('takes the open undated tasks of the month and of its weeks, a week by its Thursday', () => {
    const tasks = [
      task(['- TODO mês'], month),
      // 2026-W40 starts on 2026-09-28 and its Thursday is 2026-10-01, so it is October's
      task(['- TODO semana'], { kind: 'week', key: '2026-W40' }),
      // 2026-W settles in September by its Thursday, though it touches October
      task(['- TODO outra'], { kind: 'week', key: '2026-W39' }),
      task(['- TODO outro mês'], { kind: 'month', key: '2026-11' }),
    ]
    expect(looseIn(tasks, '2026-10').map((t) => t.block.title)).toEqual(['mês', 'semana'])
  })

  it('leaves out what has a date, is done, or is off the ladder', () => {
    const tasks = [
      task(['- TODO a', '  SCHEDULED: <2026-10-05 seg>'], month),
      task(['- TODO b', '  DEADLINE: <2026-10-05 seg>'], month),
      task(['- DONE c'], month),
      task(['- TODO d'], null),
      task(['- TODO e'], { kind: 'day', key: '2026-10-05' }),
    ]
    expect(looseIn(tasks, '2026-10')).toEqual([])
  })
})
