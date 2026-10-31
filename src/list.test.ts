import { describe, expect, it } from 'vitest'
import type { Place } from './ladder'
import { ALL, type ListFilter, type ListedTask, filterOptions, filterTasks } from './list'
import { parseBlock } from './org'

const task = (
  lines: string[],
  home: Place | null = { kind: 'list', key: 'tide.md' },
  path = 'tide.md',
): ListedTask => ({
  path,
  line: 0,
  head: lines[0],
  block: parseBlock(lines)!,
  home,
})

const dentist = task([
  '- TODO [#A] dentista :saude:casa:',
  '  :PROPERTIES:',
  '  :CATEGORY: pessoal',
  '  :ABOUT: [[saúde|minha saúde]] [[casa]]',
  '  :END:',
])
const report = task(['- DOING [#B] relatório :trabalho:'], { kind: 'day', key: '2026-10-30' }, 'daily/2026-10-30.md')
const done = task(['- DONE lavar louça :casa:'], { kind: 'week', key: '2026-W44' }, '2026-W44.md')
const loose = task(['- TODO ler artigo'], null, 'notas/leitura.md')
const TASKS = [dentist, report, done, loose]

const only = (f: Partial<ListFilter>) => filterTasks(TASKS, { ...ALL, ...f }).map((t) => t.block.title)

describe('filterTasks', () => {
  it('shows every task with no filter set', () => {
    expect(only({})).toHaveLength(4)
  })

  it('filters by state, open meaning TODO and DOING', () => {
    expect(only({ state: 'open' })).toEqual(['dentista', 'relatório', 'ler artigo'])
    expect(only({ state: 'DONE' })).toEqual(['lavar louça'])
  })

  it('filters by priority, or by having none', () => {
    expect(only({ priority: 'B' })).toEqual(['relatório'])
    expect(only({ priority: '-' })).toEqual(['lavar louça', 'ler artigo'])
  })

  it('filters by the kind of place the task lives in, or by living off the ladder', () => {
    expect(only({ place: 'list' })).toEqual(['dentista'])
    expect(only({ place: 'week' })).toEqual(['lavar louça'])
    expect(only({ place: '-' })).toEqual(['ler artigo'])
  })

  it('filters by any of the notes in :ABOUT:, read through their alias', () => {
    expect(only({ about: 'saúde' })).toEqual(['dentista'])
    expect(only({ about: 'casa' })).toEqual(['dentista'])
  })

  it('filters by any one of the tags', () => {
    expect(only({ tag: 'casa' })).toEqual(['dentista', 'lavar louça'])
  })

  it('filters by category, or by having none', () => {
    expect(only({ category: 'pessoal' })).toEqual(['dentista'])
    expect(only({ category: '-' })).toEqual(['relatório', 'lavar louça', 'ler artigo'])
  })

  it('combines every filter', () => {
    expect(only({ state: 'open', tag: 'casa' })).toEqual(['dentista'])
    expect(only({ state: 'open', tag: 'casa', category: '-' })).toEqual([])
    expect(only({ priority: 'A', place: 'list', about: 'casa', category: 'pessoal' })).toEqual(['dentista'])
  })

  it('puts the higher priority first, then sorts by title', () => {
    const b = task(['- TODO [#B] b'])
    const a = task(['- TODO a'])
    const z = task(['- TODO [#A] z'])
    expect(filterTasks([a, b, z], ALL).map((t) => t.block.title)).toEqual(['z', 'b', 'a'])
  })
})

describe('filterOptions', () => {
  it('lists the abouts, tags and categories in use, each once and sorted', () => {
    expect(filterOptions(TASKS)).toEqual({
      abouts: ['casa', 'saúde'],
      tags: ['casa', 'saude', 'trabalho'],
      categories: ['pessoal'],
    })
  })
})
