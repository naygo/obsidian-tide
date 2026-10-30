import { describe, expect, it } from 'vitest'
import { type Place, type PlaceSettings, chain, placeOf, showsAt, taskDates, tasksIn } from './ladder'
import { parseBlock } from './org'

const SETTINGS: PlaceSettings = { periodsFolder: '', inbox: 'inbox.md', listMarker: 'categories: [[lists]]' }
const LIST: Place = { kind: 'list', key: 'tide.md' }
const day = (key: string): Place => ({ kind: 'day', key })
const week = (key: string): Place => ({ kind: 'week', key })
const month = (key: string): Place => ({ kind: 'month', key })
const year = (key: string): Place => ({ kind: 'year', key })

describe('placeOf', () => {
  it('recognizes the period files', () => {
    expect(placeOf('daily/2026-10-30.md', null, SETTINGS)).toEqual(day('2026-10-30'))
    expect(placeOf('2026-W44.md', null, SETTINGS)).toEqual(week('2026-W44'))
    expect(placeOf('2026-10.md', null, SETTINGS)).toEqual(month('2026-10'))
    expect(placeOf('2026.md', null, SETTINGS)).toEqual(year('2026'))
    expect(placeOf('notas/2026.md', null, SETTINGS)).toBeNull()
    expect(placeOf('2026-10-30.md', null, SETTINGS)).toBeNull()
  })

  it('looks for weeks, months and years in the periods folder', () => {
    const s = { ...SETTINGS, periodsFolder: 'periodos' }
    expect(placeOf('periodos/2026-W44.md', null, s)).toEqual(week('2026-W44'))
    expect(placeOf('2026-W44.md', null, s)).toBeNull()
  })

  it('takes the inbox and notes with the list marker as lists', () => {
    expect(placeOf('inbox.md', null, SETTINGS)).toEqual({ kind: 'list', key: 'inbox.md' })
    // unquoted YAML, the Properties UI and a plain string all mean the same marker
    for (const categories of [[['lists']], ['[[lists]]'], '[[lists]]', ['[[lists|Listas]]', 'x']])
      expect(placeOf('tide.md', { categories }, SETTINGS)).toEqual(LIST)
    expect(placeOf('tide.md', { categories: ['[[habits]]'] }, SETTINGS)).toBeNull()
    expect(placeOf('tide.md', null, SETTINGS)).toBeNull()
  })

  it('takes a folder marker as every note under that folder', () => {
    const s = { ...SETTINGS, listMarker: 'listas' }
    expect(placeOf('listas/tide.md', null, s)).toEqual({ kind: 'list', key: 'listas/tide.md' })
    expect(placeOf('tide.md', { categories: ['[[lists]]'] }, s)).toBeNull()
  })
})

describe('chain', () => {
  it('climbs day → ISO week → month of its Thursday → year', () => {
    expect(chain('2026-10-30')).toEqual(['2026-10-30', '2026-W44', '2026-10', '2026'])
  })

  it('puts a week across months in the month of its Thursday', () => {
    // W44 runs Mon Oct 26 to Sun Nov 1, Thursday Oct 29
    expect(chain('2026-11-01')).toEqual(['2026-11-01', '2026-W44', '2026-10', '2026'])
    // W49 runs Mon Nov 30 to Sun Dec 6, Thursday Dec 3
    expect(chain('2026-11-30')).toEqual(['2026-11-30', '2026-W49', '2026-12', '2026'])
  })

  it('follows the Thursday across years too', () => {
    // 2026 has 53 weeks: W53 runs Mon Dec 28 to Sun Jan 3, Thursday Dec 31
    expect(chain('2027-01-01')).toEqual(['2027-01-01', '2026-W53', '2026-12', '2026'])
    // 2025-W01 starts Mon Dec 30 2024
    expect(chain('2024-12-30')).toEqual(['2024-12-30', '2025-W01', '2025-01', '2025'])
  })
})

describe('showsAt', () => {
  it('shows a dated list task in its year, month, week and day', () => {
    for (const here of [year('2026'), month('2026-10'), week('2026-W44'), day('2026-10-30')])
      expect(showsAt(LIST, '2026-10-30', here)).toBe(true)
  })

  it('does not show a list task in other periods', () => {
    for (const here of [year('2025'), month('2026-11'), week('2026-W45'), day('2026-10-29')])
      expect(showsAt(LIST, '2026-10-30', here)).toBe(false)
  })

  it('never shows a task above or beside where it lives', () => {
    const home = month('2026-10')
    expect(showsAt(home, '2026-10-30', year('2026'))).toBe(false)
    expect(showsAt(home, '2026-10-30', home)).toBe(false)
    expect(showsAt(home, '2026-10-30', week('2026-W44'))).toBe(true)
    expect(showsAt(home, '2026-10-30', day('2026-10-30'))).toBe(true)
    // dated outside its month: beside, so nowhere
    expect(showsAt(month('2026-09'), '2026-10-30', day('2026-10-30'))).toBe(false)
    // Nov 1 belongs to the October week, not to the November month file
    expect(showsAt(month('2026-11'), '2026-11-01', day('2026-11-01'))).toBe(false)
    expect(showsAt(month('2026-10'), '2026-11-01', day('2026-11-01'))).toBe(true)
  })

  it('shows a week task only in its days', () => {
    expect(showsAt(week('2026-W44'), '2026-11-01', day('2026-11-01'))).toBe(true)
    expect(showsAt(week('2026-W44'), '2026-11-01', month('2026-10'))).toBe(false)
  })

  it('shows nothing from a day file', () => {
    expect(showsAt(day('2026-10-29'), '2026-10-30', day('2026-10-30'))).toBe(false)
  })
})

describe('tasksIn', () => {
  it('finds every task block with its line, skipping notes and steps', () => {
    const lines = [
      '# Tarefas',
      '- TODO a',
      '  SCHEDULED: <2026-10-30 sex>',
      '  - [ ] passo',
      '- nota solta',
      '  - DONE b',
      '- CANCELED [#A] c :x:',
    ]
    const tasks = tasksIn(lines)
    expect(tasks.map((t) => [t.line, t.block.title])).toEqual([
      [1, 'a'],
      [5, 'b'],
      [6, 'c'],
    ])
    expect(tasks[0].block.scheduled?.date).toBe('2026-10-30')
    expect(tasks[0].block.steps).toHaveLength(1)
  })
})

describe('taskDates', () => {
  const dates = (...lines: string[]) => taskDates(parseBlock(['- TODO x', ...lines])!)

  it('puts a task on its SCHEDULED day and on its DEADLINE day, as the org agenda does', () => {
    expect(dates('  SCHEDULED: <2026-10-30 sex>', '  DEADLINE: <2026-11-04 qua>')).toEqual([
      { date: '2026-10-30', kind: 'scheduled' },
      { date: '2026-11-04', kind: 'deadline' },
    ])
    expect(dates('  DEADLINE: <2026-11-04 qua>')).toEqual([{ date: '2026-11-04', kind: 'deadline' }])
    expect(dates()).toEqual([])
  })

  it('shows the task once when both fall on the same day', () => {
    expect(dates('  SCHEDULED: <2026-10-30 sex 14:00>', '  DEADLINE: <2026-10-30 sex>')).toEqual([
      { date: '2026-10-30', kind: 'deadline' },
    ])
  })
})
