import { describe, expect, it } from 'vitest'
import { habitOf, marksIn, pace, plannedOn, progress, writeMark } from './habits'

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

describe('marksIn', () => {
  it('reads the log: a link alone is 1, a number its amount, a comma as a decimal point', () => {
    const note = '---\nunit: L\n---\n## registro\n- [[2026-10-30]] 1,5\n- [[2026-10-31]]\n- [[2026-11-01]] 0\n'
    expect(marksIn(note)).toEqual({ '2026-10-30': 1.5, '2026-10-31': 1 })
  })

  it('reads only the lines under the heading, up to the next one', () => {
    const note = '- [[2026-10-01]]\n## registro\n- [[2026-10-02]]\ntext\n## outro\n- [[2026-10-03]]'
    expect(marksIn(note)).toEqual({ '2026-10-02': 1 })
  })

  it('is empty with no heading', () => {
    expect(marksIn('---\nunit:\n---\n')).toEqual({})
  })
})

describe('writeMark', () => {
  it('adds the heading and the line to a note without a log', () => {
    expect(writeMark('---\nunit:\n---\n', '2026-10-31', 1, false)).toBe(
      '---\nunit:\n---\n\n## registro\n- [[2026-10-31]]\n',
    )
  })

  it('keeps the lines in date order, and replaces the line of the same day', () => {
    let note = '## registro\n- [[2026-10-29]] 1\n- [[2026-10-31]] 2\n'
    note = writeMark(note, '2026-10-30', 3, true)
    expect(note).toBe('## registro\n- [[2026-10-29]] 1\n- [[2026-10-30]] 3\n- [[2026-10-31]] 2\n')
    expect(writeMark(note, '2026-10-31', 4, true)).toBe(
      '## registro\n- [[2026-10-29]] 1\n- [[2026-10-30]] 3\n- [[2026-10-31]] 4\n',
    )
  })

  it('removes the line on 0, and writes nothing on 0 with no log', () => {
    expect(writeMark('## registro\n- [[2026-10-31]]\n', '2026-10-31', 0, false)).toBe('## registro\n')
    expect(writeMark('text\n', '2026-10-31', 0, false)).toBe('text\n')
  })

  it('round-trips through marksIn', () => {
    const note = writeMark(writeMark('', '2026-10-31', 2.5, true), '2026-10-01', 1, true)
    expect(marksIn(note)).toEqual({ '2026-10-01': 1, '2026-10-31': 2.5 })
  })
})
