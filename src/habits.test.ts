import { describe, expect, it } from 'vitest'
import {
  amountOf,
  habitOf,
  isMarked,
  orphanKeys,
  pace,
  plannedOn,
  progress,
  propertyUsed,
  renameMark,
  seedHabits,
  setAmount,
  toggleMark,
} from './habits'

describe('habitOf', () => {
  it('reads a yes/no habit planned every day from a note with only the marker', () => {
    expect(habitOf('gym.md', { categories: [['habits']] })).toEqual({
      name: 'gym',
      path: 'gym.md',
      unit: null,
      days: null,
      icon: null,
      color: null,
      archived: false,
      goal: null,
    })
  })

  it('takes the name from the file, without its folder', () => {
    expect(habitOf('hábitos/leitura.md', null).name).toBe('leitura')
  })

  it('reads days as en weekday names, in a list or a comma string, Sunday as 0', () => {
    expect(habitOf('gym.md', { days: ['mon', 'Wednesday', 'fri'] }).days).toEqual([1, 3, 5])
    expect(habitOf('gym.md', { days: 'sat, sun' }).days).toEqual([6, 0])
  })

  it('reads days it cannot understand as every day, so a typo never hides the habit', () => {
    expect(habitOf('gym.md', { days: ['seg', 'qua'] }).days).toBeNull()
    expect(habitOf('gym.md', { days: [] }).days).toBeNull()
  })

  it('keeps icon and color only from the allow-lists', () => {
    expect(habitOf('gym.md', { icon: 'dumbbell', color: 'red' })).toMatchObject({ icon: 'dumbbell', color: 'red' })
    expect(habitOf('gym.md', { icon: 'nope', color: '#f00' })).toMatchObject({ icon: null, color: null })
  })

  it('reads unit and archived', () => {
    expect(habitOf('água.md', { unit: 'copos', archived: true })).toMatchObject({ unit: 'copos', archived: true })
  })
})

describe('plannedOn', () => {
  it('plans a habit without days on every day', () => {
    expect(plannedOn(habitOf('gym.md', null), '2026-10-31')).toBe(true)
  })

  it('plans a habit only on its weekdays', () => {
    const gym = habitOf('gym.md', { days: ['mon', 'wed'] })
    // 2026-11-02 is a Monday, 2026-11-03 a Tuesday
    expect(plannedOn(gym, '2026-11-02')).toBe(true)
    expect(plannedOn(gym, '2026-11-03')).toBe(false)
  })

  it('never plans an archived habit', () => {
    expect(plannedOn(habitOf('gym.md', { archived: true }), '2026-10-31')).toBe(false)
  })
})

describe('isMarked', () => {
  it('reads a missing or false property as not marked', () => {
    expect(isMarked(null, 'gym')).toBe(false)
    expect(isMarked({}, 'gym')).toBe(false)
    expect(isMarked({ gym: false }, 'gym')).toBe(false)
    expect(isMarked({ gym: true }, 'gym')).toBe(true)
  })

  it('reads a quantity as marked, and 0 or a word as not, as the goal counts them', () => {
    expect(isMarked({ água: 2 }, 'água')).toBe(true)
    expect(isMarked({ água: 0 }, 'água')).toBe(false)
    expect(isMarked({ gym: 'sim' }, 'gym')).toBe(false)
  })
})

describe('toggleMark', () => {
  it('writes true on a habit not marked', () => {
    const fm: Record<string, unknown> = { tags: ['x'] }
    toggleMark(fm, 'gym')
    expect(fm).toEqual({ tags: ['x'], gym: true })
  })

  it('writes false on a marked habit, keeping it in the properties', () => {
    const fm: Record<string, unknown> = { gym: true }
    toggleMark(fm, 'gym')
    expect(fm).toEqual({ gym: false })
    toggleMark(fm, 'gym')
    expect(fm).toEqual({ gym: true })
  })
})

describe('propertyUsed', () => {
  it('finds a name already used as a property in any note, ignoring case', () => {
    expect(propertyUsed('Tags', [null, { tags: ['x'] }])).toBe(true)
    expect(propertyUsed('gym', [null, { tags: ['x'] }])).toBe(false)
  })
})

describe('habitOf goal', () => {
  it('reads a positive goal with its period', () => {
    expect(habitOf('gym.md', { goal: 3, goal_per: 'week' }).goal).toEqual({ amount: 3, per: 'week' })
    expect(habitOf('água.md', { unit: 'copos', goal: '8', goal_per: 'day' }).goal).toEqual({ amount: 8, per: 'day' })
  })

  it('drops goal_per: day without a unit, since a yes/no habit is at most 1 a day', () => {
    expect(habitOf('gym.md', { goal: 1, goal_per: 'day' }).goal).toBeNull()
  })

  it('drops a goal without a known goal_per or a positive amount', () => {
    expect(habitOf('gym.md', { goal: 3 }).goal).toBeNull()
    expect(habitOf('gym.md', { goal: 3, goal_per: 'fortnight' }).goal).toBeNull()
    expect(habitOf('gym.md', { goal: 0, goal_per: 'week' }).goal).toBeNull()
    expect(habitOf('gym.md', { goal: 'muito', goal_per: 'week' }).goal).toBeNull()
  })
})

describe('amountOf', () => {
  it('reads true as 1, a number as itself and a numeric string as its number', () => {
    expect(amountOf({ gym: true }, 'gym')).toBe(1)
    expect(amountOf({ água: 2.5 }, 'água')).toBe(2.5)
    expect(amountOf({ água: '2' }, 'água')).toBe(2)
  })

  it('reads anything else as 0', () => {
    expect(amountOf(null, 'gym')).toBe(0)
    expect(amountOf({ gym: false }, 'gym')).toBe(0)
    expect(amountOf({ gym: 'sim' }, 'gym')).toBe(0)
  })
})

describe('setAmount', () => {
  it('writes the number', () => {
    const fm: Record<string, unknown> = {}
    setAmount(fm, 'água', 2)
    expect(fm).toEqual({ água: 2 })
  })

  it('writes 0 on 0 or no number, keeping it in the properties', () => {
    for (const n of [0, NaN, -1]) {
      const fm: Record<string, unknown> = { água: 2 }
      setAmount(fm, 'água', n)
      expect(fm).toEqual({ água: 0 })
    }
  })
})

describe('seedHabits', () => {
  // 2026-10-31 is a Saturday
  const habits = [
    habitOf('gym.md', { days: ['mon'] }),
    habitOf('leitura.md', null),
    habitOf('água.md', { unit: 'copos' }),
    habitOf('Casa.md', null),
    habitOf('velho.md', { archived: true }),
  ]

  it('writes the planned habits unmarked, skipping the paused, the archived and the off days', () => {
    const fm: Record<string, unknown> = { tags: ['daily'] }
    seedHabits(fm, habits, '2026-10-31', new Set(['casa']))
    expect(fm).toEqual({ tags: ['daily'], leitura: false, água: 0 })
  })

  it('keeps a mark already there', () => {
    const fm: Record<string, unknown> = { leitura: true }
    seedHabits(fm, habits, '2026-10-31', new Set())
    expect(fm).toEqual({ leitura: true, água: 0, Casa: false })
  })
})

describe('progress', () => {
  const água = habitOf('água.md', { unit: 'copos', goal: 8, goal_per: 'day' })
  const gym = habitOf('gym.md', { days: ['mon'], goal: 3, goal_per: 'week' })

  it('sums the day of a daily goal', () => {
    expect(progress(água, '2026-10-31', { '2026-10-31': 2, '2026-10-30': 5 })).toBe(2)
  })

  it('sums the ISO week, counting marks off the planned days the same', () => {
    // 2026-10-26 is a Monday; 2026-11-01 the Sunday of the same week; 2026-11-02 the next Monday
    const marks = { '2026-10-25': 1, '2026-10-26': 1, '2026-10-28': 1, '2026-11-01': 1, '2026-11-02': 1 }
    expect(progress(gym, '2026-10-31', marks)).toBe(3)
  })

  it('sums the calendar month and year', () => {
    const marks = { '2026-09-30': 4, '2026-10-01': 2, '2026-10-31': 3, '2027-01-01': 7 }
    expect(progress(habitOf('l.md', { unit: 'p', goal: 100, goal_per: 'month' }), '2026-10-15', marks)).toBe(5)
    expect(progress(habitOf('l.md', { unit: 'p', goal: 100, goal_per: 'year' }), '2026-10-15', marks)).toBe(9)
  })

  it('keeps a week across a new year whole, while month and year split it', () => {
    // 2026-12-31 and 2027-01-01 both fall in 2026-W53
    const marks = { '2026-12-31': 1, '2027-01-01': 1 }
    expect(progress(gym, '2027-01-01', marks)).toBe(2)
    expect(progress(habitOf('g.md', { goal: 9, goal_per: 'year' }), '2027-01-01', marks)).toBe(1)
  })

  it('is 0 without a goal', () => {
    expect(progress(habitOf('gym.md', null), '2026-10-31', { '2026-10-31': 1 })).toBe(0)
  })
})

describe('pace', () => {
  // 2026-10-31 is a Saturday: its ISO week ends on Sunday 2026-11-01
  it('gives what is done, what is left of the goal and the days left in its period, today included', () => {
    const gym = habitOf('gym.md', { goal: 3, goal_per: 'week' })
    expect(pace(gym, '2026-10-31', { '2026-10-26': 1, '2026-10-31': 1, '2026-10-19': 1 })).toEqual({
      goal: { amount: 3, per: 'week' },
      done: 2,
      left: 1,
      daysLeft: 2,
    })
  })

  it('counts the days left to the end of the day, the month or the year', () => {
    const per = (goal_per: string) => pace(habitOf('l.md', { unit: 'p', goal: 10, goal_per }), '2026-10-31', {})
    expect(per('day')?.daysLeft).toBe(1)
    expect(per('month')?.daysLeft).toBe(1)
    expect(per('year')?.daysLeft).toBe(62)
    expect(pace(habitOf('l.md', { goal: 10, goal_per: 'month' }), '2026-02-01', {})?.daysLeft).toBe(28)
  })

  it('leaves nothing once the goal is met, however far past it', () => {
    const água = habitOf('água.md', { unit: 'copos', goal: 8, goal_per: 'day' })
    expect(pace(água, '2026-10-31', { '2026-10-31': 10 })).toEqual({
      goal: { amount: 8, per: 'day' },
      done: 10,
      left: 0,
      daysLeft: 1,
    })
  })

  it('is null for a habit without a goal', () => {
    expect(pace(habitOf('gym.md', null), '2026-10-31', {})).toBeNull()
  })
})

describe('orphanKeys', () => {
  it('finds a mark whose key no habit note has, as after renaming the note outside the plugin', () => {
    expect(orphanKeys({ gym: true, água: 2 }, ['musculação', 'água'])).toEqual(['gym'])
  })

  it('matches habit names by exact case, as the marks are read, so a mark nobody sees still shows', () => {
    expect(orphanKeys({ gym: true }, ['gym'])).toEqual([])
    expect(orphanKeys({ Gym: true }, ['gym'])).toEqual(['Gym'])
  })

  it('reads only marks as habit keys, so tags and other properties never count', () => {
    expect(orphanKeys({ tags: ['daily'], categories: ['[[daily]]'], mood: 'ok', gym: 0 }, [])).toEqual([])
    expect(orphanKeys(null, [])).toEqual([])
  })
})

describe('renameMark', () => {
  it('moves the mark to the new key and drops the old one', () => {
    const fm: Record<string, unknown> = { tags: ['x'], gym: true }
    renameMark(fm, 'gym', 'musculação')
    expect(fm).toEqual({ tags: ['x'], musculação: true })
  })

  it('renames by case only', () => {
    const fm: Record<string, unknown> = { gym: 2 }
    renameMark(fm, 'gym', 'Gym')
    expect(fm).toEqual({ Gym: 2 })
  })

  it('leaves a daily without the old key as it was', () => {
    const fm: Record<string, unknown> = { musculação: true }
    renameMark(fm, 'gym', 'musculação')
    expect(fm).toEqual({ musculação: true })
  })

  it('merges into a mark already under the new key instead of overwriting it', () => {
    const yes: Record<string, unknown> = { gym: true, musculação: true }
    renameMark(yes, 'gym', 'musculação')
    expect(yes).toEqual({ musculação: true })
    const amount: Record<string, unknown> = { agua: 2, água: 3 }
    renameMark(amount, 'agua', 'água')
    expect(amount).toEqual({ água: 5 })
  })

  it('adds nothing from an unmarked key, and a mark replaces an unmarked one', () => {
    const off: Record<string, unknown> = { gym: false, musculação: true }
    renameMark(off, 'gym', 'musculação')
    expect(off).toEqual({ musculação: true })
    const on: Record<string, unknown> = { gym: true, musculação: false }
    renameMark(on, 'gym', 'musculação')
    expect(on).toEqual({ musculação: true })
  })
})
