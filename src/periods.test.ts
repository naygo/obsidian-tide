import { describe, expect, it } from 'vitest'
import { DAILY_TEMPLATE, PERIOD_TEMPLATE, dailyName, dailyNote, periodNote, templateFiles } from './periods'
import { placeOf } from './ladder'

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
    expect(periodNote('2026-W44', SETTINGS)).toMatchObject({
      path: '2026-W44.md',
      template: 'templates/Week Template.md',
      fallback: PERIOD_TEMPLATE,
    })
    expect(periodNote('2026-10', SETTINGS)?.template).toBe('templates/Month Template.md')
    expect(periodNote('2026', SETTINGS)?.template).toBe('templates/Year Template.md')
  })

  it('uses the configured folders', () => {
    expect(
      periodNote('2026-10', { ...SETTINGS, periodsFolder: 'períodos/', templatesFolder: 'meta/tpl' }),
    ).toMatchObject({
      path: 'períodos/2026-10.md',
      template: 'meta/tpl/Month Template.md',
      fallback: PERIOD_TEMPLATE,
    })
  })

  it('refuses keys that are not a week, month or year', () => {
    expect(periodNote('2026-10-30', SETTINGS)).toBeNull()
    expect(periodNote('inbox', SETTINGS)).toBeNull()
  })
})

describe('period templates', () => {
  it('fills {{date}} with the first day of the period, never today, so two devices write the same file', () => {
    const week = periodNote('2026-W44', SETTINGS)!
    expect(week.fill!('created: {{date}} {{title}}')).toBe('created: 2026-10-26 2026-W44')
    expect(periodNote('2026-10', SETTINGS)!.fill!('{{date:YYYY}}')).toBe('2026-10-01')
  })

  it('writes the habit template with the marker, the empty properties and the log heading', () => {
    const files = Object.fromEntries(templateFiles('categories: [[habits]]'))
    expect(Object.keys(files)).toEqual(['Week Template', 'Month Template', 'Year Template', 'Habit Template'])
    expect(files['Habit Template']).toContain('categories:\n  - "[[habits]]"\nunit:')
    expect(files['Habit Template']).toMatch(/created: {{date}}\n---\n\n## registro\n$/)
    expect(files['Month Template']).toBe('---\ncreated: {{date}}\n---\n' + PERIOD_TEMPLATE)
  })

  it('keeps periods and days apart when both live in the daily folder', () => {
    const s = {
      periodsFolder: 'daily',
      inbox: 'inbox.md',
      listMarker: 'lists',
      dayOf: (p: string) => (/^daily\/\d{4}-\d{2}-\d{2}\.md$/.test(p) ? p.slice(6, -3) : null),
    }
    expect(placeOf('daily/2026-10-31.md', null, s)).toEqual({ kind: 'day', key: '2026-10-31' })
    expect(placeOf('daily/2026-10.md', null, s)).toEqual({ kind: 'month', key: '2026-10' })
    expect(placeOf('daily/2026.md', null, s)).toEqual({ kind: 'year', key: '2026' })
    expect(placeOf('daily/2026-W44.md', null, s)).toEqual({ kind: 'week', key: '2026-W44' })
  })
})
