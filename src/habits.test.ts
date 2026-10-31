import { describe, expect, it } from 'vitest'
import { habitOf, isMarked, plannedOn, propertyUsed, toggleMark } from './habits'

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
})

describe('toggleMark', () => {
  it('writes true on a habit not marked', () => {
    const fm: Record<string, unknown> = { tags: ['x'] }
    toggleMark(fm, 'gym')
    expect(fm).toEqual({ tags: ['x'], gym: true })
  })

  it('deletes the property of a marked habit, never writing false', () => {
    const fm: Record<string, unknown> = { gym: true }
    toggleMark(fm, 'gym')
    expect(fm).toEqual({})
  })
})

describe('propertyUsed', () => {
  it('finds a name already used as a property in any note, ignoring case', () => {
    expect(propertyUsed('Tags', [null, { tags: ['x'] }])).toBe(true)
    expect(propertyUsed('gym', [null, { tags: ['x'] }])).toBe(false)
  })
})
