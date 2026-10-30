import { findBlock } from './actions'
import { type OrgBlock, parseBlock, parseHead } from './org'

/** Where a task lives. Period keys are the file names: 2026-10-30, 2026-W44, 2026-10, 2026; a list's key is its path. */
export type Place = { kind: 'list' | 'year' | 'month' | 'week' | 'day'; key: string }

export interface PlaceSettings {
  /** folder of the week, month and year files; '' is the vault root */
  periodsFolder: string
  inbox: string
  /** `property: value` marks lists by frontmatter; anything else is a folder holding the lists */
  listMarker: string
}

const PERIODS: [Place['kind'], RegExp][] = [
  ['year', /^\d{4}$/],
  ['month', /^\d{4}-\d{2}$/],
  ['week', /^\d{4}-W\d{2}$/],
]

export function placeOf(path: string, frontmatter: Record<string, unknown> | null, s: PlaceSettings): Place | null {
  const daily = /^daily\/(\d{4}-\d{2}-\d{2})\.md$/.exec(path)
  if (daily) return { kind: 'day', key: daily[1] }
  const prefix = s.periodsFolder ? s.periodsFolder.replace(/\/+$/, '') + '/' : ''
  if (path.startsWith(prefix) && path.endsWith('.md')) {
    const name = path.slice(prefix.length, -3)
    const period = PERIODS.find(([, re]) => re.test(name))
    if (period) return { kind: period[0], key: name }
  }
  return path === s.inbox || isList(path, frontmatter, s.listMarker) ? { kind: 'list', key: path } : null
}

/** `property: value` or a folder path. */
export function parseMarker(marker: string): { property: string; value: string } | { folder: string } {
  const m = /^([^:]+):\s*(.+)$/.exec(marker)
  return m ? { property: m[1].trim(), value: m[2].trim() } : { folder: marker.replace(/\/+$/, '') }
}

function isList(path: string, frontmatter: Record<string, unknown> | null, marker: string): boolean {
  const m = parseMarker(marker)
  if ('folder' in m) return path.startsWith(m.folder + '/')
  const target = linkName(m.value)
  // unquoted `[[lists]]` is YAML for a nested array, so flatten before comparing
  return [frontmatter?.[m.property]].flat(2).some((v) => typeof v === 'string' && linkName(v) === target)
}

const linkName = (v: string) => v.trim().replace(/^\[\[([^|\]]*)(\|[^\]]*)?\]\]$/, '$1')

/** ISO-8601 week key of a YYYY-MM-DD date, and the date of that week's Thursday. */
export function isoWeek(date: string): { week: string; thursday: string } {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7))
  const year = t.getUTCFullYear()
  const n = Math.floor((t.getTime() - Date.UTC(year, 0, 1)) / 864e5 / 7) + 1
  return { week: `${year}-W${String(n).padStart(2, '0')}`, thursday: t.toISOString().slice(0, 10) }
}

/**
 * A task dated `date` living at `home` shows at `here` when `here` holds the date and `home` is strictly above it.
 * A day sits under its ISO week and under its calendar month and year; the week sits under the month and year
 * of its Thursday, so a day at a month's edge climbs both ways.
 */
export function showsAt(home: Place, date: string, here: Place): boolean {
  const { week, thursday } = isoWeek(date)
  const holds = { day: date, week, month: date.slice(0, 7), year: date.slice(0, 4) }
  if (here.kind === 'list' || holds[here.kind] !== here.key) return false
  if (home.kind === 'list') return true
  const aboveWeek = [thursday.slice(0, 7), thursday.slice(0, 4)]
  const above: Record<keyof typeof holds, string[]> = {
    day: [week, holds.month, holds.year, ...aboveWeek],
    week: aboveWeek,
    month: [holds.year],
    year: [],
  }
  return above[here.kind].includes(home.key)
}

export interface TaskDate {
  date: string
  kind: 'scheduled' | 'deadline'
}

/** Like the org agenda: a task falls on its SCHEDULED day and on its DEADLINE day, once if they match. */
export function taskDates(b: OrgBlock): TaskDate[] {
  const out: TaskDate[] = []
  if (b.scheduled && b.scheduled.date !== b.deadline?.date) out.push({ date: b.scheduled.date, kind: 'scheduled' })
  if (b.deadline) out.push({ date: b.deadline.date, kind: 'deadline' })
  return out
}

export interface FoundTask {
  /** line of the task head in the file */
  line: number
  block: OrgBlock
}

/** Every block headed by a keyword, nested ones included. */
export function tasksIn(lines: string[]): FoundTask[] {
  return lines.flatMap((l, line) => {
    if (!parseHead(l)?.state) return []
    const { start, end } = findBlock(lines, line)!
    return [{ line, block: parseBlock(lines.slice(start, end))! }]
  })
}
