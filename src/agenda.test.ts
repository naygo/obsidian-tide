import { describe, expect, it } from 'vitest'
import { agenda } from './agenda'
import type { Place } from './ladder'
import type { ListedTask } from './list'
import { parseBlock } from './org'

const TODAY = '2026-10-30'
const LIST: Place = { kind: 'list', key: 'tide.md' }
const day = (key: string): Place => ({ kind: 'day', key })

const item = (lines: string[], home: Place | null = LIST, line = 0): ListedTask => ({
  path: home?.kind === 'day' ? `daily/${home.key}.md` : (home?.key ?? 'notas/solta.md'),
  line,
  head: lines[0],
  block: parseBlock(lines)!,
  home,
})

const titles = (entries: { task: ListedTask }[]) => entries.map((e) => e.task.block.title)
const dayOf = (a: ReturnType<typeof agenda>, date: string) => a.days.find((d) => d.date === date)!.entries

describe('agenda', () => {
  it('has today and the next 6 days, empty ones included', () => {
    expect(agenda([], [], TODAY).days.map((d) => d.date)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
    ])
  })

  it('puts a task on its SCHEDULED day and on its DEADLINE day', () => {
    const a = agenda([item(['- TODO a', '  SCHEDULED: <2026-10-31 sáb>', '  DEADLINE: <2026-11-02 seg>'])], [], TODAY)
    expect(dayOf(a, '2026-10-31').map((e) => e.kind)).toEqual(['scheduled'])
    expect(dayOf(a, '2026-11-02').map((e) => e.kind)).toEqual(['deadline'])
  })

  it('puts a daily task without SCHEDULED on the day of its file', () => {
    const a = agenda([item(['- TODO a'], day('2026-10-31'))], [], TODAY)
    expect(titles(dayOf(a, '2026-10-31'))).toEqual(['a'])
  })

  it('puts a daily task off the rule on its SCHEDULED day only', () => {
    const a = agenda([item(['- TODO a', '  SCHEDULED: <2026-11-01 dom>'], day('2026-10-31'))], [], TODAY)
    expect(titles(dayOf(a, '2026-10-31'))).toEqual([])
    expect(titles(dayOf(a, '2026-11-01'))).toEqual(['a'])
  })

  it('shows events with their time, the timed entries first and in order', () => {
    const a = agenda(
      [
        item(['- TODO sem hora', '  SCHEDULED: <2026-10-30 sex>']),
        item(['- reunião', '  SCHEDULED: <2026-10-30 sex 14:00>'], day(TODAY), 3),
        item(['- café', '  SCHEDULED: <2026-10-30 sex 9:30>'], day(TODAY), 1),
      ],
      [],
      TODAY,
    )
    expect(dayOf(a, TODAY).map((e) => [e.task.block.title, e.time])).toEqual([
      ['café', '9:30'],
      ['reunião', '14:00'],
      ['sem hora', null],
    ])
  })

  it('lists the open tasks with a date gone by as overdue, once each, but never an event nor a closed task', () => {
    const a = agenda(
      [
        item(['- TODO a', '  SCHEDULED: <2026-10-28 qua>', '  DEADLINE: <2026-10-29 qui>']),
        item(['- DOING b', '  DEADLINE: <2026-10-20 ter>']),
        item(['- DONE c', '  SCHEDULED: <2026-10-28 qua>']),
        item(['- reunião', '  SCHEDULED: <2026-10-28 qua 14:00>']),
      ],
      [],
      TODAY,
    )
    expect(a.overdue.map((e) => [e.task.block.title, e.date, e.kind])).toEqual([
      ['b', '2026-10-20', 'deadline'],
      ['a', '2026-10-28', 'scheduled'],
    ])
  })

  it('never makes a daily task overdue for the day of its file: that is pending', () => {
    expect(agenda([item(['- TODO a'], day('2026-10-28'))], [], TODAY).overdue).toEqual([])
  })

  it('lists the pending tasks, but a pending task with a DEADLINE gone by only as overdue', () => {
    const pending = item(['- TODO a'], day('2026-10-28'))
    const late = item(['- TODO b', '  DEADLINE: <2026-10-29 qui>'], { kind: 'week', key: '2026-W43' })
    const a = agenda([pending, late], [pending, late], TODAY)
    expect(a.pending.map((t) => t.block.title)).toEqual(['a'])
    expect(titles(a.overdue)).toEqual(['b'])
  })

  it('leaves out what lives off the ladder', () => {
    const a = agenda([item(['- TODO a', '  SCHEDULED: <2026-10-30 sex>'], null)], [], TODAY)
    expect(dayOf(a, TODAY)).toEqual([])
  })
})
