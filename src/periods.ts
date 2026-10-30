import { type PlaceSettings, placeOf } from './ladder'

export interface PeriodSettings extends PlaceSettings {
  templatesFolder: string
}

/** The fields Tide uses from `.obsidian/daily-notes.json`, the core Daily notes settings. */
export interface DailyConfig {
  folder?: string
  format?: string
  template?: string
}

/** A note to create when missing: its path, the template to copy, and what to write when the template is missing. */
export interface NoteSpec {
  path: string
  template: string | null
  fallback: string
}

// Deterministic, with no time or stamp: two devices creating the same day write the same file, so git merges it.
export const DAILY_TEMPLATE = '```tide-tasks\n```\n\n```tide-habits\n```\n\n## Notas\n'
export const PERIOD_TEMPLATE = '```tide-tasks\n```\n'

const TEMPLATE_NAMES = { week: 'Semana', month: 'Mês', year: 'Ano' } as const

const join = (folder: string | undefined, name: string) => {
  const dir = (folder ?? '').replace(/^\/+|\/+$/g, '')
  return dir ? `${dir}/${name}` : name
}

/** `name` is today already formatted with the core's format. */
export function dailyNote(config: DailyConfig, name: string): NoteSpec {
  const template = config.template?.trim()
  return {
    path: join(config.folder, `${name}.md`),
    template: template ? (template.endsWith('.md') ? template : `${template}.md`) : null,
    fallback: DAILY_TEMPLATE,
  }
}

/** The file of a week, month or year key (2026-W44, 2026-10, 2026); null for any other key. */
export function periodNote(key: string, s: PeriodSettings): NoteSpec | null {
  const path = join(s.periodsFolder, `${key}.md`)
  const kind = placeOf(path, null, s)?.kind
  if (kind !== 'week' && kind !== 'month' && kind !== 'year') return null
  return { path, template: join(s.templatesFolder, `${TEMPLATE_NAMES[kind]}.md`), fallback: PERIOD_TEMPLATE }
}
