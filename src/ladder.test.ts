import { describe, expect, it } from 'vitest'
import {
  type Place,
  type PlaceSettings,
  eventsIn,
  indexedDates,
  isoWeek,
  offRule,
  offRuleHeads,
  placeOf,
  showsAt,
  showsEntry,
  taskDates,
  tasksIn,
} from './ladder'
import { parseBlock } from './org'

const SETTINGS: PlaceSettings = {
  periodsFolder: '',
  inbox: 'inbox.md',
  listMarker: 'categories: [[lists]]',
  dayOf: (path) => /^daily\/(\d{4}-\d{2}-\d{2})\.md$/.exec(path)?.[1] ?? null,
}
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

  it('asks dayOf which files are days, so the core Daily notes folder and format decide', () => {
    const s = { ...SETTINGS, dayOf: (path: string) => (path === 'diario/30-10-2026.md' ? '2026-10-30' : null) }
    expect(placeOf('diario/30-10-2026.md', null, s)).toEqual(day('2026-10-30'))
    expect(placeOf('daily/2026-10-30.md', null, s)).toBeNull()
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

describe('isoWeek', () => {
  it('gives the ISO week of a date and the Thursday that names its month', () => {
    expect(isoWeek('2026-10-30')).toEqual({ week: '2026-W44', thursday: '2026-10-29' })
    // W44 runs Mon Oct 26 to Sun Nov 1
    expect(isoWeek('2026-11-01')).toEqual({ week: '2026-W44', thursday: '2026-10-29' })
    // 2026 has 53 weeks: W53 runs Mon Dec 28 to Sun Jan 3
    expect(isoWeek('2027-01-01')).toEqual({ week: '2026-W53', thursday: '2026-12-31' })
    expect(isoWeek('2024-12-30')).toEqual({ week: '2025-W01', thursday: '2025-01-02' })
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

  it('puts a day in its calendar month and year, even when its week belongs elsewhere', () => {
    expect(showsAt(LIST, '2026-11-01', month('2026-11'))).toBe(true)
    expect(showsAt(LIST, '2026-11-01', month('2026-10'))).toBe(false)
    expect(showsAt(LIST, '2026-11-01', week('2026-W44'))).toBe(true)
    expect(showsAt(LIST, '2027-01-01', year('2027'))).toBe(true)
    expect(showsAt(LIST, '2027-01-01', year('2026'))).toBe(false)
    expect(showsAt(LIST, '2027-01-01', week('2026-W53'))).toBe(true)
  })

  it('never shows a task above or beside where it lives', () => {
    const home = month('2026-10')
    expect(showsAt(home, '2026-10-30', year('2026'))).toBe(false)
    expect(showsAt(home, '2026-10-30', home)).toBe(false)
    expect(showsAt(home, '2026-10-30', week('2026-W44'))).toBe(true)
    expect(showsAt(home, '2026-10-30', day('2026-10-30'))).toBe(true)
    // dated outside its month: beside, so nowhere
    expect(showsAt(month('2026-09'), '2026-10-30', day('2026-10-30'))).toBe(false)
  })

  it('follows the Thursday for a week across months', () => {
    // W44 belongs to October: below the October file, beside the November one
    expect(showsAt(month('2026-10'), '2026-11-01', week('2026-W44'))).toBe(true)
    expect(showsAt(month('2026-11'), '2026-11-01', week('2026-W44'))).toBe(false)
    // Nov 1 sits under its week (so under October) and under November
    expect(showsAt(month('2026-10'), '2026-11-01', day('2026-11-01'))).toBe(true)
    expect(showsAt(month('2026-11'), '2026-11-01', day('2026-11-01'))).toBe(true)
    // across years: W53 belongs to 2026, Jan 1 2027 to both
    expect(showsAt(year('2026'), '2027-01-01', week('2026-W53'))).toBe(true)
    expect(showsAt(year('2026'), '2027-01-01', day('2027-01-01'))).toBe(true)
    expect(showsAt(year('2026'), '2027-01-01', month('2027-01'))).toBe(false)
    expect(showsAt(year('2026'), '2026-11-02', month('2026-11'))).toBe(true)
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

describe('eventsIn', () => {
  it('finds the keywordless lines with SCHEDULED, not the notes nor the items inside a task', () => {
    const lines = [
      '- reunião',
      '  SCHEDULED: <2026-10-30 sex 14:00>',
      '- nota solta',
      '- TODO a',
      '  - almoço',
      '    SCHEDULED: <2026-10-30 sex 12:00>',
      '- aniversário',
      '  SCHEDULED: <2026-11-02 seg>',
    ]
    expect(eventsIn(lines).map((e) => [e.line, e.block.title, e.block.scheduled?.time])).toEqual([
      [0, 'reunião', '14:00'],
      [6, 'aniversário', null],
    ])
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

describe('offRule', () => {
  const rule = (home: Place | null, ...lines: string[]) => offRule(parseBlock(['- TODO x', ...lines])!, home)
  const repeater = '  SCHEDULED: <2026-10-30 sex +1w>'

  it('flags a repeater outside a list', () => {
    expect(rule(LIST, repeater)).toBeNull()
    expect(rule({ kind: 'list', key: 'inbox.md' }, repeater)).toBeNull()
    for (const home of [day('2026-10-30'), { kind: 'week', key: '2026-W44' } as Place])
      expect(rule(home, repeater)).toBe('repeater')
  })

  it("flags a daily's SCHEDULED on another day, but not its DEADLINE", () => {
    expect(rule(day('2026-10-30'), '  SCHEDULED: <2026-10-30 sex 14:00>')).toBeNull()
    expect(rule(day('2026-10-30'), '  SCHEDULED: <2026-10-31 sáb>')).toBe('scheduled')
    expect(rule(day('2026-10-30'), '  DEADLINE: <2026-11-05 qui>')).toBeNull()
    expect(rule({ kind: 'month', key: '2026-10' }, '  SCHEDULED: <2026-10-31 sáb>')).toBeNull()
  })

  it('takes the repeater first, since moving to a list fixes both', () => {
    expect(rule(day('2026-10-30'), '  SCHEDULED: <2026-10-31 sáb +1w>')).toBe('repeater')
  })

  it('leaves notes off the ladder alone', () => {
    expect(rule(null, repeater)).toBeNull()
  })
})

describe('offRuleHeads', () => {
  it('finds the head of every block off the rule, events and nested tasks included', () => {
    const lines = [
      '- TODO a',
      '  SCHEDULED: <2026-10-31 sáb>',
      '  - TODO a1',
      '    SCHEDULED: <2026-10-30 sex>',
      '  - [ ] passo',
      '- reunião',
      '  SCHEDULED: <2026-11-02 seg 10:00>',
      '- TODO b',
      '  SCHEDULED: <2026-10-30 sex>',
      '- nota',
      '  - TODO c',
      '    SCHEDULED: <2026-10-30 sex +1d>',
    ]
    expect(offRuleHeads(lines, day('2026-10-30'))).toEqual([
      [0, 'scheduled'],
      [5, 'scheduled'],
      [10, 'repeater'],
    ])
  })
})

describe('indexedDates', () => {
  const dates = (home: Place, ...lines: string[]) => indexedDates(parseBlock(['- TODO x', ...lines])!, home)
  const W45: Place = { kind: 'week', key: '2026-W45' }

  it('is not off for a task whose date its period holds, even a repeater', () => {
    expect(dates(W45, '  SCHEDULED: <2026-11-03 ter +1w>')).toEqual([
      { date: '2026-11-03', kind: 'scheduled', off: false },
    ])
  })

  it('is off on the SCHEDULED of a repeater that left its period, its DEADLINE untouched', () => {
    expect(dates(W45, '  SCHEDULED: <2026-11-10 ter +1w>', '  DEADLINE: <2026-11-20 sex>')).toEqual([
      { date: '2026-11-10', kind: 'scheduled', off: true },
      { date: '2026-11-20', kind: 'deadline', off: false },
    ])
  })

  it('feeds from a daily only its SCHEDULED on another day, labelled deadline when both match', () => {
    const today = day('2026-10-30')
    expect(dates(today, '  SCHEDULED: <2026-10-30 sex 14:00>', '  DEADLINE: <2026-11-05 qui>')).toEqual([])
    expect(dates(today, '  SCHEDULED: <2026-11-02 seg>', '  DEADLINE: <2026-11-05 qui>')).toEqual([
      { date: '2026-11-02', kind: 'scheduled', off: true },
    ])
    expect(dates(today, '  SCHEDULED: <2026-11-02 seg +1w>', '  DEADLINE: <2026-11-02 seg>')).toEqual([
      { date: '2026-11-02', kind: 'deadline', off: true },
    ])
  })
})

describe('showsEntry', () => {
  it('shows a date off the rule on its day only', () => {
    const entry = { home: week('2026-W45'), date: '2026-11-10', off: true }
    expect(showsEntry(entry, day('2026-11-10'))).toBe(true)
    for (const here of [day('2026-11-11'), week('2026-W46'), month('2026-11'), year('2026')])
      expect(showsEntry(entry, here)).toBe(false)
  })

  it('follows the ladder otherwise', () => {
    const entry = { home: week('2026-W45'), date: '2026-11-03', off: false }
    expect(showsEntry(entry, day('2026-11-03'))).toBe(true)
    expect(showsEntry(entry, month('2026-11'))).toBe(false)
  })
})
