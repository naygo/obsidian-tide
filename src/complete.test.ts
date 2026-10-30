import { describe, expect, it } from 'vitest'
import { type SuggestContext, orgSuggest, vocabulary } from './complete'

// 2026-10-30 is a Friday
const CTX: SuggestContext = { list: false, day: null, tags: [], categories: [], now: new Date(2026, 9, 30, 14, 5) }

/** The suggestions with the cursor at `|`, as their inserted texts. */
function at(doc: string, ctx: Partial<SuggestContext> = {}) {
  const lines = doc.split('\n')
  const line = lines.findIndex((l) => l.includes('|'))
  const ch = lines[line].indexOf('|')
  lines[line] = lines[line].replace('|', '')
  return orgSuggest(lines, line, ch, { ...CTX, ...ctx })
}
const texts = (doc: string, ctx: Partial<SuggestContext> = {}) => at(doc, ctx)?.items.map((s) => s.text) ?? []

describe('states', () => {
  it('offers the states matching the letters typed after the dash', () => {
    expect(texts('- D|')).toEqual(['DOING ', 'DONE '])
    expect(at('- D|')).toMatchObject({ from: 2, to: 3 })
  })

  it('stays quiet on a bare dash, lowercase text and a head that has a state', () => {
    expect(at('- |')).toBeNull()
    expect(at('- tomar|')).toBeNull()
    expect(at('- TODO D|')).toBeNull()
  })

  it('does not offer again a state typed in full', () => {
    expect(texts('- TODO|')).toEqual([])
  })
})

describe('tags', () => {
  const tags = ['saude', 'casa', 'sono']

  it('offers the vault tags after a colon at the end of a head', () => {
    expect(texts('- TODO dentista :s|', { tags })).toEqual(['saude:', 'sono:'])
    expect(at('- TODO dentista :s|', { tags })).toMatchObject({ from: 17, to: 18 })
    expect(texts('- dentista :|', { tags })).toEqual(['saude:', 'casa:', 'sono:'])
  })

  it('leaves out the tags the head already has and one typed in full', () => {
    expect(texts('- TODO dentista :saude:|', { tags })).toEqual(['casa:', 'sono:'])
    expect(texts('- TODO dentista :casa|', { tags })).toEqual([])
  })

  it('stays quiet on a colon inside the title and on a step', () => {
    expect(at('- TODO reunião:|', { tags })).toBeNull()
    expect(at('- [ ] passo :|', { tags })).toBeNull()
  })
})

describe('planning keys', () => {
  it('offers SCHEDULED and DEADLINE right under the head, leaving the cursor inside the date', () => {
    const s = at('- TODO dentista\n  S|')!
    expect(s.items).toEqual([{ label: 'SCHEDULED', text: 'SCHEDULED: <>', cursor: 12 }])
    expect(s).toMatchObject({ from: 2, to: 3 })
  })

  it('offers only the key the block does not have yet, under the other planning lines', () => {
    expect(texts('- TODO dentista\n  SCHEDULED: <2026-10-30 sex>\n  D|')).toEqual(['DEADLINE: <>'])
    expect(texts('- TODO dentista\n  SCHEDULED: <2026-10-30 sex>\n  S|')).toEqual([])
  })

  it('stays quiet below a drawer or body text, where the parser would not read it', () => {
    expect(at('- TODO dentista\n  levar exames\n  S|')).toBeNull()
    expect(at('- TODO dentista\n  :PROPERTIES:\n  :CATEGORY: pessoal\n  :END:\n  D|')).toBeNull()
  })

  it('does not offer again a key typed in full', () => {
    expect(texts('- TODO dentista\n  DEADLINE|')).toEqual([])
  })
})

describe('drawer', () => {
  it('inserts the drawer with :CREATED: at the current time', () => {
    const s = at('- TODO dentista\n  SCHEDULED: <2026-10-30 sex>\n  :|')!
    const text = ':PROPERTIES:\n  :CREATED: [2026-10-30 sex 14:05]\n  :END:'
    expect(s.items).toEqual([{ label: ':PROPERTIES:', text, cursor: text.indexOf('\n  :END:') }])
  })

  it('is not offered when the block has one, or below body text', () => {
    expect(at('- TODO dentista\n  :PROPERTIES:\n  :END:\n  :|')).toBeNull()
    expect(at('- TODO dentista\n  levar exames\n  :|')).toBeNull()
  })

  it('offers :CATEGORY: and :ABOUT: inside the drawer, never :CREATED: alone', () => {
    expect(texts('- TODO dentista\n  :PROPERTIES:\n  :|\n  :END:')).toEqual([':CATEGORY: ', ':ABOUT: '])
    expect(texts('- TODO dentista\n  :PROPERTIES:\n  :C|\n  :END:')).toEqual([':CATEGORY: '])
    expect(texts('- TODO dentista\n  :PROPERTIES:\n  :CATEGORY: pessoal\n  :|\n  :END:')).toEqual([':ABOUT: '])
  })

  it('offers the vault categories after :CATEGORY:', () => {
    const categories = ['pessoal', 'profissional', 'estudo']
    expect(texts('- TODO x\n  :PROPERTIES:\n  :CATEGORY: p|\n  :END:', { categories })).toEqual([
      'pessoal',
      'profissional',
    ])
    expect(texts('- TODO x\n  :PROPERTIES:\n  :CATEGORY: estudo|\n  :END:', { categories })).toEqual([])
  })
})

describe('dates', () => {
  it('offers today and the next days with the weekday, the cursor before the >', () => {
    const s = at('- TODO x\n  DEADLINE: <|>')!
    expect(s.items.map((i) => i.text)).toEqual([
      '2026-10-30 sex',
      '2026-10-31 sáb',
      '2026-11-01 dom',
      '2026-11-02 seg',
      '2026-11-03 ter',
      '2026-11-04 qua',
      '2026-11-05 qui',
    ])
    expect(s).toMatchObject({ from: 13, to: 13 })
  })

  it('narrows to what was typed and writes the weekday of a full date', () => {
    expect(texts('- TODO x\n  DEADLINE: <2026-11-0|>')).toEqual([
      '2026-11-01 dom',
      '2026-11-02 seg',
      '2026-11-03 ter',
      '2026-11-04 qua',
      '2026-11-05 qui',
    ])
    expect(texts('- TODO x\n  DEADLINE: <2026-12-25|>')).toEqual(['2026-12-25 sex'])
    expect(texts('- TODO x\n  DEADLINE: <2026-02-30|>')).toEqual([])
  })

  it('closes the date when the > is missing', () => {
    expect(at('- TODO x\n  DEADLINE: <2026-12-25|')!.items).toEqual([
      { label: '2026-12-25 sex', text: '2026-12-25 sex>', cursor: 14 },
    ])
  })

  it('offers only the daily date for SCHEDULED in a daily; DEADLINE takes any', () => {
    const day = '2026-10-28'
    expect(texts('- TODO x\n  SCHEDULED: <|>', { day })).toEqual(['2026-10-28 qua'])
    expect(texts('- TODO x\n  SCHEDULED: <2026-12-25|>', { day })).toEqual([])
    expect(texts('- TODO x\n  DEADLINE: <2026-12-25|>', { day })).toEqual(['2026-12-25 sex'])
  })
})

describe('repeaters', () => {
  it('offers the repeaters after the SCHEDULED date in a list', () => {
    const doc = '- TODO x\n  SCHEDULED: <2026-10-30 sex |>'
    expect(texts(doc, { list: true })).toEqual(['+1d', '+1w', '+1m', '+1y'])
    expect(texts('- TODO x\n  SCHEDULED: <2026-10-30 sex 14:00 +1|>', { list: true })).toEqual([
      '+1d',
      '+1w',
      '+1m',
      '+1y',
    ])
    expect(texts('- TODO x\n  SCHEDULED: <2026-10-30 sex +1w|>', { list: true })).toEqual([])
  })

  it('offers none outside a list, nor on DEADLINE', () => {
    expect(at('- TODO x\n  SCHEDULED: <2026-10-30 sex |>')).toBeNull()
    expect(at('- TODO x\n  DEADLINE: <2026-10-30 sex |>', { list: true })).toBeNull()
  })
})

describe('vocabulary', () => {
  it('collects the tags of every head and the categories of every drawer, once each', () => {
    const lines = [
      '- TODO dentista :saude:casa:',
      '  :PROPERTIES:',
      '  :CATEGORY: pessoal',
      '  :END:',
      '- reunião :trabalho:',
      '  - DOING pauta :casa:',
      '    :PROPERTIES:',
      '    :CATEGORY: profissional',
      '    :END:',
      '- [ ] passo :nao:',
      'texto :nao:',
    ]
    expect(vocabulary(lines)).toEqual({ tags: ['saude', 'casa', 'trabalho'], categories: ['pessoal', 'profissional'] })
  })
})

describe('the whole block counts', () => {
  it('does not offer a key or the drawer the block has below the cursor', () => {
    expect(texts('- TODO x\n  S|\n  SCHEDULED: <2026-10-30 sex>')).toEqual([])
    expect(texts('- TODO x\n  :|\n  :PROPERTIES:\n  :CATEGORY: pessoal\n  :END:')).toEqual([])
  })

  it('stays quiet with the cursor inside a word', () => {
    expect(at('- T|ODO foo')).toBeNull()
    expect(at('- TODO x\n  SCH|EDULED: <2026-10-30 sex>')).toBeNull()
    expect(at('- TODO x :sa|ude:', { tags: ['saude', 'sono'] })).toBeNull()
  })
})
