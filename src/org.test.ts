import { describe, expect, it } from 'vitest'
import {
  captureLine,
  facesOf,
  formatTimestamp,
  parseBlock,
  parseHead,
  serializeBlock,
  shiftDate,
  writeWeekday,
} from './org'

const SPEC_EXAMPLE = [
  '- TODO [#A] dentista :saude:casa:',
  '  SCHEDULED: <2026-10-30 sex 14:00 +1w>',
  '  DEADLINE: <2026-10-31 sáb>',
  '  CLOSED: [2026-10-29 qui 15:02]',
  '  :PROPERTIES:',
  '  :CREATED: [2026-10-29 qui 10:00]',
  '  :CATEGORY: pessoal',
  '  :ABOUT: [[saúde]]',
  '  :END:',
  '  :LOGBOOK:',
  '  - State "DONE" from "TODO" [2026-10-24] (ocorrência de 2026-10-24)',
  '  :END:',
  '  descrição em texto solto',
  '  - [ ] passo',
]

describe('parseBlock', () => {
  it('reads every part of the spec example', () => {
    const b = parseBlock(SPEC_EXAMPLE)!
    expect(b.kind).toBe('task')
    expect(b.state).toBe('TODO')
    expect(b.priority).toBe('A')
    expect(b.title).toBe('dentista')
    expect(b.tags).toEqual(['saude', 'casa'])
    expect(b.scheduled).toEqual({ date: '2026-10-30', time: '14:00', repeater: '+1w' })
    expect(b.deadline).toEqual({ date: '2026-10-31', time: null, repeater: null })
    expect(b.closed).toEqual({ date: '2026-10-29', time: '15:02', repeater: null })
    expect(b.properties).toEqual([
      ['CREATED', '[2026-10-29 qui 10:00]'],
      ['CATEGORY', 'pessoal'],
      ['ABOUT', '[[saúde]]'],
    ])
    expect(b.logbook).toEqual(['  - State "DONE" from "TODO" [2026-10-24] (ocorrência de 2026-10-24)'])
    expect(b.body).toEqual(['  descrição em texto solto', '  - [ ] passo'])
    expect(b.steps).toEqual([{ checked: false, text: 'passo' }])
  })

  it('round-trips the spec example without losing anything', () => {
    expect(serializeBlock(parseBlock(SPEC_EXAMPLE)!)).toEqual(SPEC_EXAMPLE)
  })
})

describe('parseBlock variations', () => {
  it.each([
    ['bare task', ['- TODO comprar pão']],
    ['task with only a deadline', ['- DOING relatório', '  DEADLINE: <2026-11-02 seg>']],
    ['task with only a drawer', ['- TODO ler', '  :PROPERTIES:', '  :CATEGORY: estudo', '  :END:']],
    ['task with only body', ['- DONE lavar louça', '  rápido', '  - [x] secar']],
    ['nested task with tab-indented children', ['  - TODO aninhada', '\t\tSCHEDULED: <2026-10-30 sex>']],
    ['aligned tags', ['- TODO [#C] alinhada      :a:b:']],
    ['malformed planning falls into body', ['- TODO x', '  SCHEDULED: <ontem>', '  :PROPERTIES:', '  :END:']],
    ['unclosed drawer falls into body', ['- TODO x', '  :LOGBOOK:', '  - algo']],
    ['loose note', ['- uma nota solta']],
  ])('round-trips %s', (_, lines) => {
    expect(serializeBlock(parseBlock(lines)!)).toEqual(lines)
  })

  it('classifies by keyword and SCHEDULED', () => {
    expect(parseBlock(['- TODO x'])!.kind).toBe('task')
    expect(parseBlock(['- consulta', '  SCHEDULED: <2026-10-30 sex 09:00>'])!.kind).toBe('event')
    expect(parseBlock(['- consulta', '  DEADLINE: <2026-10-30 sex>'])!.kind).toBe('note')
  })

  it('keeps bare data in a task without drawer or dates', () => {
    const b = parseBlock(['- DONE lavar louça', '  rápido', '  - [x] secar'])!
    expect([b.scheduled, b.deadline, b.closed, b.properties, b.logbook]).toEqual([null, null, null, null, null])
    expect(b.tags).toEqual([])
    expect(b.steps).toEqual([{ checked: true, text: 'secar' }])
  })

  it('does not treat steps or near-keywords as tasks', () => {
    expect(parseBlock(['- [ ] passo'])).toBeNull()
    expect(parseBlock(['- TODOS os dias'])!.state).toBeNull()
    expect(parseBlock(['texto'])).toBeNull()
  })
})

describe('weekday inside < >', () => {
  it('is decorative: any abbreviation, or none, parses the same', () => {
    const at = (ts: string) => parseBlock(['- TODO x', `  SCHEDULED: ${ts}`])!.scheduled
    expect(at('<2026-10-30 Fri 14:00>')).toEqual(at('<2026-10-30 sex 14:00>'))
    expect(at('<2026-10-30 14:00>')).toEqual(at('<2026-10-30 sex 14:00>'))
    expect(at('<2026-10-30 qua 14:00>')).toEqual(at('<2026-10-30 sex 14:00>'))
  })

  it('is written from the date in the UI language', () => {
    const lines = ['- TODO x', '  DEADLINE: <2026-10-31 Sat>']
    expect(serializeBlock(parseBlock(lines)!)).toEqual(['- TODO x', '  DEADLINE: <2026-10-31 sáb>'])
  })
})

describe('shiftDate', () => {
  it.each([
    ['2026-10-30', '+1d', '2026-10-31'],
    ['2026-12-31', '+1d', '2027-01-01'],
    ['2028-02-28', '+1d', '2028-02-29'],
    ['2026-10-30', '+1w', '2026-11-06'],
    ['2026-12-28', '+2w', '2027-01-11'],
    ['2026-10-30', '+1m', '2026-11-30'],
    ['2026-01-31', '+1m', '2026-02-28'],
    ['2028-01-31', '+1m', '2028-02-29'],
    ['2026-12-15', '+1m', '2027-01-15'],
    ['2026-10-31', '+3m', '2027-01-31'],
    ['2026-10-30', '+1y', '2027-10-30'],
    ['2028-02-29', '+1y', '2029-02-28'],
    ['2028-02-29', '+4y', '2032-02-29'],
  ])('%s %s → %s', (date, repeater, next) => {
    expect(shiftDate(date, repeater)).toBe(next)
  })
})

describe('captureLine', () => {
  it('makes a TODO of plain text', () => {
    expect(captureLine('comprar pão')).toBe('- TODO comprar pão')
  })

  it('keeps the org syntax typed with it', () => {
    expect(parseHead(captureLine('[#A] dentista :saude:')!)).toMatchObject({
      state: 'TODO',
      priority: 'A',
      title: 'dentista',
      tags: ['saude'],
    })
  })

  it('keeps a state or a dash already typed', () => {
    expect(captureLine('DOING relatório')).toBe('- DOING relatório')
    expect(captureLine('- TODO x')).toBe('- TODO x')
    expect(captureLine('- x')).toBe('- TODO x')
  })

  it('takes a closed state as text, since it would need its CLOSED line', () => {
    expect(captureLine('DONE x')).toBe('- TODO DONE x')
  })

  it('keeps it on one line', () => {
    expect(captureLine('  ligar\n  para  ana \n')).toBe('- TODO ligar para  ana')
  })

  it('gives nothing for blank text', () => {
    expect(captureLine(' \n ')).toBeNull()
  })
})

describe('facesOf', () => {
  const on = (line: string) => facesOf(line).map((f) => [f.cls, line.slice(f.from, f.to)])

  it('finds the drawers, a property name, the state log and the timestamps', () => {
    expect(on('  :PROPERTIES:')).toEqual([['tide-drawer', ':PROPERTIES:']])
    expect(on('  :CREATED: [2026-10-31 sáb 10:00]')).toEqual([
      ['tide-property', ':CREATED:'],
      ['tide-date', '[2026-10-31 sáb 10:00]'],
    ])
    expect(on('  - State "DONE" from "TODO" [2026-10-31 sáb]')).toEqual([
      ['tide-log', '- State "DONE" from "TODO"'],
      ['tide-date', '[2026-10-31 sáb]'],
    ])
    expect(on('  SCHEDULED: <2026-10-31 sáb>')).toEqual([['tide-date', '<2026-10-31 sáb>']])
  })

  it('leaves a link to a day and plain text alone', () => {
    expect(on('- TODO ver [[2026-10-31]] hoje')).toEqual([])
  })
})

describe('formatTimestamp without the weekday', () => {
  it('writes a plain ISO date, and the parser still reads the old form with a weekday', () => {
    writeWeekday(false)
    try {
      expect(formatTimestamp({ date: '2026-10-31', time: '10:47', repeater: null }, false)).toBe('[2026-10-31 10:47]')
      expect(formatTimestamp({ date: '2026-10-31', time: null, repeater: '+1w' }, true)).toBe('<2026-10-31 +1w>')
    } finally {
      writeWeekday(true)
    }
    const block = parseBlock(['- TODO a', '  SCHEDULED: <2026-10-31 sáb>'])!
    expect(block.scheduled).toEqual({ date: '2026-10-31', time: null, repeater: null })
  })
})
