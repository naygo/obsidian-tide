import { describe, expect, it } from 'vitest'
import type { Place } from './ladder'
import { migrate, moveBlock, pendingIn } from './move'

const TODAY = '2026-10-30'
const day = (key: string): Place => ({ kind: 'day', key })
const LIST: Place = { kind: 'list', key: 'tide.md' }

describe('moveBlock', () => {
  it('cuts the whole block and moves SCHEDULED to the day, with the same time', () => {
    const lines = [
      '- antes',
      '- TODO [#A] dentista :saude:',
      '  SCHEDULED: <2026-10-30 sex 14:00>',
      '  DEADLINE: <2026-11-05 qui>',
      '  :PROPERTIES:',
      '  :CATEGORY: pessoal',
      '  :END:',
      '  :LOGBOOK:',
      '  - nota',
      '  :END:',
      '  descrição',
      '  - [ ] passo',
      '- depois',
    ]
    expect(moveBlock(lines, 8, LIST, day('2026-11-02'), TODAY)).toEqual({
      source: ['- antes', '- depois'],
      moved: [
        '- TODO [#A] dentista :saude:',
        '  SCHEDULED: <2026-11-02 seg 14:00>',
        '  DEADLINE: <2026-11-05 qui>',
        ...lines.slice(4, 12),
      ],
    })
  })

  const task = ['- TODO x', '  SCHEDULED: <2026-11-02 seg 14:00>', '  DEADLINE: <2026-12-20 dom>']
  const kept = (dest: Place) => moveBlock(task, 0, day('2026-11-01'), dest, TODAY)?.moved
  const dropped = ['- TODO x', '  DEADLINE: <2026-12-20 dom>']

  it('keeps SCHEDULED when the week, month or year holds it, and drops it with the time when not', () => {
    expect(kept({ kind: 'week', key: '2026-W45' })).toEqual(task)
    expect(kept({ kind: 'week', key: '2026-W46' })).toEqual(dropped)
    expect(kept({ kind: 'month', key: '2026-11' })).toEqual(task)
    expect(kept({ kind: 'month', key: '2026-12' })).toEqual(dropped)
    expect(kept({ kind: 'year', key: '2026' })).toEqual(task)
    expect(kept({ kind: 'year', key: '2027' })).toEqual(dropped)
  })

  it('keeps SCHEDULED going to a list, which sits above every date', () => {
    expect(kept({ kind: 'list', key: 'tide.md' })).toEqual(task)
  })

  describe('a repeating task', () => {
    const repeating = ['- a', '- TODO x', '  SCHEDULED: <2026-10-28 qua 08:00 +1w>', '  :LOGBOOK:', '  :END:', '- b']
    const postponed = (dest: Place) => moveBlock(repeating, 1, LIST, dest, TODAY)
    const at = (ts: string) => ({
      source: repeating.map((l, i) => (i === 2 ? `  SCHEDULED: <${ts} 08:00 +1w>` : l)),
      moved: null,
    })

    it('changes file when moved to another list', () => {
      expect(postponed({ kind: 'list', key: 'inbox.md' })).toEqual({
        source: ['- a', '- b'],
        moved: repeating.slice(1, 5),
      })
    })

    it('is postponed in place when moved to a day', () => {
      expect(postponed(day('2026-11-03'))).toEqual(at('2026-11-03 ter'))
    })

    it('is postponed to today when the period holds today, else to its first day', () => {
      expect(postponed({ kind: 'week', key: '2026-W44' })).toEqual(at('2026-10-28 qua'))
      expect(postponed({ kind: 'week', key: '2026-W45' })).toEqual(at('2026-11-02 seg'))
      expect(postponed({ kind: 'week', key: '2027-W01' })).toEqual(at('2027-01-04 seg'))
      expect(postponed({ kind: 'week', key: '2026-W53' })).toEqual(at('2026-12-28 seg'))
      expect(postponed({ kind: 'month', key: '2026-11' })).toEqual(at('2026-11-01 dom'))
      expect(postponed({ kind: 'year', key: '2026' })).toEqual(at('2026-10-28 qua'))
      expect(postponed({ kind: 'year', key: '2027' })).toEqual(at('2027-01-01 sex'))
      const late = repeating.map((l) => l.replace('2026-10-28 qua', '2026-09-01 ter'))
      expect(moveBlock(late, 1, LIST, { kind: 'month', key: '2026-10' }, TODAY)!.source[2]).toBe(
        '  SCHEDULED: <2026-10-30 sex 08:00 +1w>',
      )
    })
  })

  it('stays where it is, with the rules applied, when it already lives at the destination', () => {
    const lines = ['- TODO x', '  SCHEDULED: <2026-12-02 qua>', '- y']
    expect(moveBlock(lines, 0, LIST, LIST, TODAY)).toEqual({ source: lines, moved: null })
    expect(moveBlock(lines, 0, { kind: 'month', key: '2026-11' }, { kind: 'month', key: '2026-11' }, TODAY)).toEqual({
      source: ['- TODO x', '- y'],
      moved: null,
    })
  })

  it('moves a repeating task that lives outside a list instead of postponing it', () => {
    const lines = ['- TODO x', '  SCHEDULED: <2026-10-28 qua +1w>']
    expect(moveBlock(lines, 0, day('2026-10-28'), { kind: 'week', key: '2026-W45' }, TODAY)).toEqual({
      source: [],
      moved: ['- TODO x', '  SCHEDULED: <2026-11-02 seg +1w>'],
    })
  })

  it('takes a nested task out to the top level', () => {
    const lines = ['- projeto', '  - TODO x', '    - [ ] passo', '  - TODO y']
    expect(moveBlock(lines, 2, LIST, { kind: 'list', key: 'inbox.md' }, TODAY)).toEqual({
      source: ['- projeto', '  - TODO y'],
      moved: ['- TODO x', '  - [ ] passo'],
    })
  })
})

describe('pendingIn', () => {
  const lines = [
    '- TODO sem data',
    '  DEADLINE: <2026-11-05 qui>',
    '- DOING em andamento',
    '  - TODO filho, vai junto com o pai',
    '- TODO agendada',
    '  SCHEDULED: <2026-10-20 ter>',
    '  - TODO filho de agendada, fica com ela',
    '- DONE feita',
    '- nota solta',
  ]
  const pending = [0, 2]

  it('takes TODO and DOING without SCHEDULED from a period that is over', () => {
    expect(pendingIn(lines, day('2026-10-29'), TODAY)).toEqual(pending)
    expect(pendingIn(lines, { kind: 'week', key: '2026-W43' }, TODAY)).toEqual(pending)
    expect(pendingIn(lines, { kind: 'month', key: '2026-09' }, TODAY)).toEqual(pending)
    expect(pendingIn(lines, { kind: 'year', key: '2025' }, TODAY)).toEqual(pending)
  })

  it('takes nothing from a period still running or still to come', () => {
    for (const home of [day(TODAY), day('2026-10-31'), { kind: 'week', key: '2026-W44' } as Place])
      expect(pendingIn(lines, home, TODAY)).toEqual([])
    expect(pendingIn(lines, { kind: 'month', key: '2026-10' }, TODAY)).toEqual([])
    expect(pendingIn(lines, { kind: 'year', key: '2026' }, TODAY)).toEqual([])
  })

  it('never takes from a list', () => {
    expect(pendingIn(lines, LIST, TODAY)).toEqual([])
  })
})

describe('migrate', () => {
  it('cuts every pending block and hands them over in file order, DEADLINE untouched', () => {
    const lines = ['- TODO a', '  DEADLINE: <2026-11-05 qui>', '- DONE b', '- DOING c', '  - TODO c1']
    expect(migrate(lines, day('2026-10-29'), TODAY)).toEqual({
      source: ['- DONE b'],
      moved: ['- TODO a', '  DEADLINE: <2026-11-05 qui>', '- DOING c', '  - TODO c1'],
    })
  })

  it('leaves a task inside another with its parent', () => {
    expect(migrate(['- DONE pai', '  - TODO filho'], day('2026-10-29'), TODAY)).toBeNull()
  })

  it('is null when nothing is pending', () => {
    expect(migrate(['- TODO a'], day(TODAY), TODAY)).toBeNull()
  })
})
