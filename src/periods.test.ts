import { describe, expect, it } from 'vitest'
import { DAILY_TEMPLATE, PERIOD_TEMPLATE, dailyNote, periodNote } from './periods'

const SETTINGS = {
  periodsFolder: '',
  inbox: 'inbox.md',
  listMarker: 'categories: [[lists]]',
  templatesFolder: 'templates',
}

describe('dailyNote', () => {
  it('follows the core Daily notes folder and template', () => {
    expect(dailyNote({ folder: 'daily', template: 'templates/Daily' }, '2026-10-30')).toEqual({
      path: 'daily/2026-10-30.md',
      template: 'templates/Daily.md',
      fallback: DAILY_TEMPLATE,
    })
  })

  it('works with the core defaults: vault root and no template', () => {
    expect(dailyNote({}, '2026-10-30')).toEqual({ path: '2026-10-30.md', template: null, fallback: DAILY_TEMPLATE })
    expect(dailyNote({ folder: '/daily/', template: '' }, '2026-10-30').path).toBe('daily/2026-10-30.md')
  })

  it('has a deterministic default without Daily.base', () => {
    expect(DAILY_TEMPLATE).toBe('```tide-tasks\n```\n\n```tide-habits\n```\n\n## Notas\n')
  })
})

describe('periodNote', () => {
  it('maps week, month and year to their template', () => {
    expect(periodNote('2026-W44', SETTINGS)).toEqual({
      path: '2026-W44.md',
      template: 'templates/Semana.md',
      fallback: PERIOD_TEMPLATE,
    })
    expect(periodNote('2026-10', SETTINGS)?.template).toBe('templates/Mês.md')
    expect(periodNote('2026', SETTINGS)?.template).toBe('templates/Ano.md')
  })

  it('uses the configured folders', () => {
    expect(periodNote('2026-10', { ...SETTINGS, periodsFolder: 'períodos/', templatesFolder: 'meta/tpl' })).toEqual({
      path: 'períodos/2026-10.md',
      template: 'meta/tpl/Mês.md',
      fallback: PERIOD_TEMPLATE,
    })
  })

  it('refuses keys that are not a week, month or year', () => {
    expect(periodNote('2026-10-30', SETTINGS)).toBeNull()
    expect(periodNote('inbox', SETTINGS)).toBeNull()
  })
})
