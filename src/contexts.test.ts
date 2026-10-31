import { describe, expect, it } from 'vitest'
import { declarationLine, declarationsIn, parseDeclaration, parseInterval, pausedOn } from './contexts'

describe('parseDeclaration', () => {
  it('reads the interval and the paused habits of a declaration line', () => {
    expect(parseDeclaration('- 2026-11-01 → 2026-11-07 [[gym]] [[leitura]]')).toEqual({
      from: '2026-11-01',
      to: '2026-11-07',
      habits: ['gym', 'leitura'],
    })
  })

  it('takes -> for the arrow, an alias or a folder in the link, and spacing as typed', () => {
    expect(parseDeclaration('  * 2026-11-01->2026-11-07 [[hábitos/gym|Academia]]  ')).toEqual({
      from: '2026-11-01',
      to: '2026-11-07',
      habits: ['gym'],
    })
  })

  it('takes the note of a link to a heading', () => {
    expect(parseDeclaration('- 2026-11-01 → 2026-11-07 [[gym#Treino]]')?.habits).toEqual(['gym'])
  })

  it('is no declaration without both dates or without a link', () => {
    expect(parseDeclaration('- 2026-11-01 [[gym]]')).toBeNull()
    expect(parseDeclaration('- 2026-11-01 → 2026-11-07')).toBeNull()
    expect(parseDeclaration('- 2026-11-01 → 2026-11-07 [[gym]] e mais texto')).toBeNull()
    expect(parseDeclaration('- TODO [[gym]]')).toBeNull()
  })
})

describe('declarationsIn', () => {
  it('collects every declaration line of a note, skipping the rest', () => {
    const data =
      '---\npause: [[[gym]]]\n---\n# Hard work\n- 2026-11-01 → 2026-11-07 [[gym]]\ntexto\n- 2026-12-01 → 2026-12-02 [[água]]'
    expect(declarationsIn(data.split('\n'))).toEqual([
      { from: '2026-11-01', to: '2026-11-07', habits: ['gym'] },
      { from: '2026-12-01', to: '2026-12-02', habits: ['água'] },
    ])
  })
})

describe('pausedOn', () => {
  const declarations = [
    { from: '2026-11-01', to: '2026-11-07', habits: ['gym', 'Leitura'] },
    { from: '2026-11-07', to: '2026-11-08', habits: ['água'] },
  ]

  it('pauses the habits of each declaration whose interval holds the date, both ends included', () => {
    expect(pausedOn(declarations, '2026-11-01')).toEqual(new Set(['gym', 'leitura']))
    expect(pausedOn(declarations, '2026-11-07')).toEqual(new Set(['gym', 'leitura', 'água']))
    expect(pausedOn(declarations, '2026-10-31')).toEqual(new Set())
  })
})

describe('declarationLine', () => {
  it('copies the pause of the note, as YAML or as the Properties UI writes it', () => {
    const line = '- 2026-11-01 → 2026-11-07 [[gym]] [[leitura]]'
    expect(declarationLine('2026-11-01', '2026-11-07', [[['gym']], [['leitura']]])).toBe(line)
    expect(declarationLine('2026-11-01', '2026-11-07', ['[[gym]]', '[[leitura]]'])).toBe(line)
    expect(declarationLine('2026-11-01', '2026-11-07', '[[gym]], [[leitura]]')).toBe(line)
  })

  it('reads back as the declaration it writes', () => {
    const line = declarationLine('2026-11-01', '2026-11-07', ['[[gym]]'])
    expect(parseDeclaration(line!)).toEqual({ from: '2026-11-01', to: '2026-11-07', habits: ['gym'] })
  })

  it('is nothing without a habit to pause', () => {
    expect(declarationLine('2026-11-01', '2026-11-07', undefined)).toBeNull()
    expect(declarationLine('2026-11-01', '2026-11-07', [])).toBeNull()
  })
})

describe('parseInterval', () => {
  it('reads two dates with any separator, or one date as a single day', () => {
    expect(parseInterval('2026-11-01 → 2026-11-07')).toEqual({ from: '2026-11-01', to: '2026-11-07' })
    expect(parseInterval('2026-11-01 2026-11-07')).toEqual({ from: '2026-11-01', to: '2026-11-07' })
    expect(parseInterval('2026-11-01')).toEqual({ from: '2026-11-01', to: '2026-11-01' })
  })

  it('refuses an end before the start, a date that does not exist, or no date', () => {
    expect(parseInterval('2026-11-07 → 2026-11-01')).toBeNull()
    expect(parseInterval('2026-02-30')).toBeNull()
    expect(parseInterval('semana que vem')).toBeNull()
  })
})
