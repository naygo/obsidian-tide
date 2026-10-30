import { periodOf } from './ladder'

export interface PeriodSettings {
  periodsFolder: string
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
  /** fills the variables of the template; the fallback has none */
  fill?: (template: string) => string
}

// Deterministic, with no time or stamp: two devices creating the same day write the same file, so git merges it.
export const DAILY_TEMPLATE = '```tide-tasks\n```\n\n```tide-habits\n```\n\n## Notas\n'
export const PERIOD_TEMPLATE = '```tide-tasks\n```\n'
export const DAILY_FORMAT = 'YYYY-MM-DD'

// file names in the vault, so they stay the same whatever the UI language
const TEMPLATE_NAMES = { week: 'Week', month: 'Month', year: 'Year' } as const

const join = (folder: string | undefined, name: string) => {
  const dir = (folder ?? '').replace(/^\/+|\/+$/g, '')
  return dir ? `${dir}/${name}` : name
}

/**
 * `name` is the day already formatted with the core's format, and `format` formats that same day.
 * Like the core, the template's {{date}} and {{title}} become the name and {{date:FORMAT}} the day in FORMAT.
 * {{time}} stays as it is: two devices creating the same day must write the same file.
 */
export function dailyNote(config: DailyConfig, name: string, format: (f: string) => string): NoteSpec {
  const template = config.template?.trim()
  return {
    path: join(config.folder, `${name}.md`),
    template: template ? (template.endsWith('.md') ? template : `${template}.md`) : null,
    fallback: DAILY_TEMPLATE,
    fill: (text) =>
      text
        .replace(/{{\s*title\s*}}/gi, name)
        .replace(/{{\s*date\s*(?::([^}]*))?}}/gi, (_, f?: string) => (f?.trim() ? format(f.trim()) : name)),
  }
}

/** The name of a file in the daily folder without `.md`, to read back with the core's format; null elsewhere. */
export function dailyName(config: DailyConfig, path: string): string | null {
  const prefix = join(config.folder, '')
  return path.startsWith(prefix) && path.endsWith('.md') ? path.slice(prefix.length, -3) : null
}

/** The file of a week, month or year key (2026-W44, 2026-10, 2026); null for any other key. */
export function periodNote(key: string, s: PeriodSettings): NoteSpec | null {
  const path = join(s.periodsFolder, `${key}.md`)
  const kind = periodOf(path, s.periodsFolder)?.kind
  if (kind !== 'week' && kind !== 'month' && kind !== 'year') return null
  return { path, template: join(s.templatesFolder, `${TEMPLATE_NAMES[kind]}.md`), fallback: PERIOD_TEMPLATE }
}
