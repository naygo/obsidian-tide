import { describe, expect, it } from 'vitest'
import { orgAction, type Action, type Change } from './actions'

const NOW = new Date(2026, 9, 30, 9, 5) // sex 2026-10-30 09:05

function apply(doc: string, changes: Change[]): string {
  return [...changes]
    .sort((a, b) => b.from - a.from)
    .reduce((d, c) => d.slice(0, c.from) + c.insert + d.slice(c.to), doc)
}

function run(doc: string, line: number, action: Action): string | null {
  const changes = orgAction(doc.split('\n'), line, action, NOW)
  return changes && apply(doc, changes)
}

describe('orgAction', () => {
  it('advances state from any line of the task block', () => {
    const doc = ['- TODO x', '  SCHEDULED: <2026-10-30 sex>', '  - [ ] passo', '- outra'].join('\n')
    expect(run(doc, 2, 'nextState')).toBe(doc.replace('TODO', 'DOING'))
  })
})

describe('orgAction states', () => {
  const task = ['- TODO x :t:', '  SCHEDULED: <2026-10-30 sex>', '  :LOGBOOK:', '  - nota antiga', '  :END:'].join('\n')

  it('writes CLOSED on DONE, after the planning lines', () => {
    const done = run(task.replace('TODO', 'DOING'), 3, 'nextState')
    expect(done).toBe(
      [
        '- DONE x :t:',
        '  SCHEDULED: <2026-10-30 sex>',
        '  CLOSED: [2026-10-30 sex 09:05]',
        '  :LOGBOOK:',
        '  - nota antiga',
        '  :END:',
      ].join('\n'),
    )
  })

  it('keeps CLOSED going DONE → CANCELED and drops it going back to TODO', () => {
    const done = '- DONE x\n  CLOSED: [2026-10-29 qui 15:02]'
    expect(run(done, 0, 'nextState')).toBe('- CANCELED x\n  CLOSED: [2026-10-29 qui 15:02]')
    expect(run(done, 1, 'prevState')).toBe('- DOING x')
    expect(run('- CANCELED x\n  CLOSED: [2026-10-29 qui 15:02]\n- y', 0, 'prevState')).toBe(
      '- DONE x\n  CLOSED: [2026-10-29 qui 15:02]\n- y',
    )
  })

  it('writes CLOSED on a head-only task at the end of the document', () => {
    expect(run('a\n- DOING x', 1, 'nextState')).toBe('a\n- DONE x\n  CLOSED: [2026-10-30 sex 09:05]')
  })

  it('leaves untouched lines out of the edit', () => {
    const changes = orgAction(task.split('\n'), 1, 'nextState', NOW)!
    expect(changes).toEqual([{ from: 2, to: 6, insert: 'DOING' }])
  })

  it('turns a loose item into TODO, and the ring wraps back to a loose item', () => {
    expect(run('- comprar pão', 0, 'nextState')).toBe('- TODO comprar pão')
    expect(run('- TODO comprar pão', 0, 'prevState')).toBe('- comprar pão')
    expect(run('- CANCELED x\n  CLOSED: [2026-10-29 qui 15:02]', 0, 'nextState')).toBe('- x')
  })

  it('finds the task from its logbook entries and nested bullets', () => {
    expect(run(task, 3, 'nextState')).toBe(task.replace('TODO', 'DOING'))
    expect(run('- nota\n  - TODO sub\n    detalhe', 2, 'nextState')).toBe('- nota\n  - DOING sub\n    detalhe')
    expect(run('- nota\n  - sub', 1, 'nextState')).toBe('- TODO nota\n  - sub')
  })

  it('does not apply off a block, on steps outside tasks or backwards on a loose item', () => {
    expect(run('texto\n\n- TODO x', 0, 'nextState')).toBeNull()
    expect(run('- TODO x\n\n- TODO y', 1, 'nextState')).toBeNull()
    expect(run('- [ ] passo', 0, 'nextState')).toBeNull()
    expect(run('- comprar pão', 0, 'prevState')).toBeNull()
  })

  it('stops the block at the next sibling', () => {
    expect(run('- DOING x\n\n- y', 0, 'nextState')).toBe('- DONE x\n  CLOSED: [2026-10-30 sex 09:05]\n\n- y')
  })
})

describe('orgAction priority', () => {
  it('cycles up B → A → none and down B → C → none, starting at B', () => {
    expect(run('- TODO x', 0, 'priorityUp')).toBe('- TODO [#B] x')
    expect(run('- TODO [#B] x', 0, 'priorityUp')).toBe('- TODO [#A] x')
    expect(run('- TODO [#A] x :t:', 0, 'priorityUp')).toBe('- TODO x :t:')
    expect(run('- TODO x', 0, 'priorityDown')).toBe('- TODO [#B] x')
    expect(run('- TODO [#B] x', 0, 'priorityDown')).toBe('- TODO [#C] x')
    expect(run('- TODO [#C] x', 0, 'priorityDown')).toBe('- TODO x')
  })

  it('works from any line of the task but not on loose items', () => {
    expect(run('- DOING x\n  - [ ] passo', 1, 'priorityUp')).toBe('- DOING [#B] x\n  - [ ] passo')
    expect(run('- nota', 0, 'priorityUp')).toBeNull()
  })
})

describe('orgAction leaves the rest of the block as written', () => {
  it.each([
    ['DEADLINE above SCHEDULED', ['- DOING x', '  DEADLINE: <2026-10-31 sáb>', '  SCHEDULED: <2026-10-30 sex>']],
    ['deeper drawer', ['- DOING x', '  SCHEDULED: <2026-10-30 sex>', '    :PROPERTIES:', '    :ABOUT: ', '    :END:']],
  ])('with %s', (_, lines) => {
    const out = run(lines.join('\n'), 0, 'nextState')!.split('\n')
    expect(out[0]).toBe('- DONE x')
    expect(out.filter((l) => !l.includes('CLOSED'))).toEqual(['- DONE x', ...lines.slice(1)])
  })

  it('removes only the CLOSED line, wherever it sits among the planning lines', () => {
    const doc = ['- DONE x', '  CLOSED: [2026-10-29 qui 15:02]', '  DEADLINE: <2026-10-31 sáb>'].join('\n')
    expect(run(doc, 0, 'prevState')).toBe('- DOING x\n  DEADLINE: <2026-10-31 sáb>')
  })
})
