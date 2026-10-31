import { describe, expect, it } from 'vitest'
import { DAILY_TEMPLATE, PERIOD_TEMPLATE, dailyName, dailyNote, periodNote } from './periods'

const SETTINGS = { periodsFolder: '', templatesFolder: 'templates' }
const date = (format: string) => `<${format}>`

describe('dailyNote', () => {
  it('follows the core Daily notes folder and template', () => {
    expect(dailyNote({ folder: 'daily', template: 'templates/Daily' }, '2026-10-30', date)).toMatchObject({
      path: 'daily/2026-10-30.md',
      template: 'templates/Daily.md',
      fallback: DAILY_TEMPLATE,
    })
  })

  it('works with the core defaults: vault root and no template', () => {
    expect(dailyNote({}, '2026-10-30', date)).toMatchObject({ path: '2026-10-30.md', template: null })
    expect(dailyNote({ folder: '/daily/', template: '' }, '2026-10-30', date).path).toBe('daily/2026-10-30.md')
  })

  it('fills {{date}} and {{title}} like the core, and leaves {{time}} so both devices write the same file', () => {
    const { fill } = dailyNote({}, '2026-10-30', date)
    expect(fill?.('# {{title}} {{ date }} {{date:YYYY}} {{DATE:dddd}} {{time}}')).toBe(
      '# 2026-10-30 2026-10-30 <YYYY> <dddd> {{time}}',
    )
  })

  it('has a deterministic default without Daily.base', () => {
    expect(DAILY_TEMPLATE).toBe('```tide-tasks\n```\n\n## Notas\n')
  })
})

describe('dailyName', () => {
  it('gives the name to read back with the core format, for files in the daily folder', () => {
    expect(dailyName({ folder: 'diario/' }, 'diario/30-10-2026.md')).toBe('30-10-2026')
    expect(dailyName({ folder: 'diario' }, 'diario/2026/10/30.md')).toBe('2026/10/30')
    expect(dailyName({ folder: 'diario' }, 'outra/30-10-2026.md')).toBeNull()
    expect(dailyName({ folder: 'diario' }, 'diario/foto.png')).toBeNull()
    expect(dailyName({}, '2026-10-30.md')).toBe('2026-10-30')
  })
})

describe('periodNote', () => {
  it('maps week, month and year to their template', () => {
    expect(periodNote('2026-W44', SETTINGS)).toEqual({
      path: '2026-W44.md',
      template: 'templates/Week.md',
      fallback: PERIOD_TEMPLATE,
    })
    expect(periodNote('2026-10', SETTINGS)?.template).toBe('templates/Month.md')
    expect(periodNote('2026', SETTINGS)?.template).toBe('templates/Year.md')
  })

  it('uses the configured folders', () => {
    expect(periodNote('2026-10', { ...SETTINGS, periodsFolder: 'períodos/', templatesFolder: 'meta/tpl' })).toEqual({
      path: 'períodos/2026-10.md',
      template: 'meta/tpl/Month.md',
      fallback: PERIOD_TEMPLATE,
    })
  })

  it('refuses keys that are not a week, month or year', () => {
    expect(periodNote('2026-10-30', SETTINGS)).toBeNull()
    expect(periodNote('inbox', SETTINGS)).toBeNull()
  })
})
