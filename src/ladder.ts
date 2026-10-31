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
  /** the YYYY-MM-DD date of a daily note's path, or null; the core Daily notes folder and format decide */
  dayOf(path: string): string | null
}

const PERIODS: [Place['kind'], RegExp][] = [
  ['year', /^\d{4}$/],
  ['month', /^\d{4}-\d{2}$/],
  ['week', /^\d{4}-W\d{2}$/],
]

export function placeOf(path: string, frontmatter: Record<string, unknown> | null, s: PlaceSettings): Place | null {
  const day = s.dayOf(path)
  if (day) return { kind: 'day', key: day }
  const period = periodOf(path, s.periodsFolder)
  if (period) return period
  return path === s.inbox || hasMarker(path, frontmatter, s.listMarker) ? { kind: 'list', key: path } : null
}

/** The week, month or year file at `path`, looked for in the periods folder. */
export function periodOf(path: string, periodsFolder: string): Place | null {
  const prefix = periodsFolder ? periodsFolder.replace(/\/+$/, '') + '/' : ''
  if (!path.startsWith(prefix) || !path.endsWith('.md')) return null
  const name = path.slice(prefix.length, -3)
  const period = PERIODS.find(([, re]) => re.test(name))
  return period ? { kind: period[0], key: name } : null
}

/** `property: value` or a folder path. */
export function parseMarker(marker: string): { property: string; value: string } | { folder: string } {
  const m = /^([^:]+):\s*(.+)$/.exec(marker)
  return m ? { property: m[1].trim(), value: m[2].trim() } : { folder: marker.replace(/\/+$/, '') }
}

/** Whether the note carries the marker of a list or a habit: the property's value, or a place in the folder. */
export function hasMarker(path: string, frontmatter: Record<string, unknown> | null, marker: string): boolean {
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

/** The first day of a day, week (its Monday), month or year; a list has none. */
export function firstDay({ kind, key }: Place): string {
  if (kind === 'month') return `${key}-01`
  if (kind === 'year') return `${key}-01-01`
  if (kind !== 'week') return key
  // January 4th is always in week 1
  const year = Number(key.slice(0, 4))
  const jan4 = new Date(Date.UTC(year, 0, 4)).getUTCDay()
  const monday = 4 - ((jan4 + 6) % 7) + (Number(key.slice(6)) - 1) * 7
  return new Date(Date.UTC(year, 0, monday)).toISOString().slice(0, 10)
}

/** The key of the day, ISO week, calendar month or year that holds the date. */
export function keyOf(kind: Exclude<Place['kind'], 'list'>, date: string): string {
  return kind === 'week' ? isoWeek(date).week : date.slice(0, { day: 10, month: 7, year: 4 }[kind])
}

/** Whether the date falls in the place: its day, ISO week, calendar month or year. A list holds every date. */
export function holds(place: Place, date: string): boolean {
  return place.kind === 'list' || keyOf(place.kind, date) === place.key
}

/**
 * A task dated `date` living at `home` shows at `here` when `here` holds the date and `home` is strictly above it.
 * A day sits under its ISO week and under its calendar month and year; the week sits under the month and year
 * of its Thursday, so a day at a month's edge climbs both ways.
 */
export function showsAt(home: Place, date: string, here: Place): boolean {
  if (here.kind === 'list' || !holds(here, date)) return false
  if (home.kind === 'list') return true
  const { week, thursday } = isoWeek(date)
  const aboveWeek = [thursday.slice(0, 7), thursday.slice(0, 4)]
  const above: Record<Exclude<Place['kind'], 'list'>, string[]> = {
    day: [week, date.slice(0, 7), date.slice(0, 4), ...aboveWeek],
    week: aboveWeek,
    month: [date.slice(0, 4)],
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

/** Every event: a keywordless line with SCHEDULED, outside any task, whose block is its own. */
export function eventsIn(lines: string[]): FoundTask[] {
  return lines.flatMap((l, line) => {
    const range = !parseHead(l)?.state && findBlock(lines, line)
    if (!range || range.start !== line) return []
    const block = parseBlock(lines.slice(line, range.end))!
    return block.kind === 'event' ? [{ line, block }] : []
  })
}

/** Whether the day, week, month or year is over by `today`. A list never is. */
export function ended(place: Place, today: string): boolean {
  return place.kind !== 'list' && firstDay(place) < today && !holds(place, today)
}

/** Head lines of the TODO and DOING without SCHEDULED at the top; a task inside another stays with its parent. */
export function openUndated(lines: string[]): number[] {
  let end = 0
  return tasksIn(lines).flatMap(({ line, block }) => {
    if (line < end) return []
    end = findBlock(lines, line)!.end
    if (block.scheduled || (block.state !== 'TODO' && block.state !== 'DOING')) return []
    return [line]
  })
}

/** How a line breaks "repetition lives in a list": a repeater outside a list, or a daily's SCHEDULED on another day. */
export type OffRule = 'repeater' | 'scheduled'

/** Why the block is off the rule; the repeater first, as a list fixes both. Null off the ladder, where nothing shows it. */
export function offRule(block: OrgBlock, home: Place | null): OffRule | null {
  const s = block.scheduled
  if (!s || !home) return null
  if (s.repeater && home.kind !== 'list') return 'repeater'
  return home.kind === 'day' && s.date !== home.key ? 'scheduled' : null
}

/** Head lines of the blocks off the rule and why, for the mark in the editor. */
export function offRuleHeads(lines: string[], home: Place | null): [number, OffRule][] {
  if (!home) return []
  return lines.flatMap((l, i): [number, OffRule][] => {
    if (!parseHead(l)) return []
    const range = findBlock(lines, i)
    // a loose item inside a task belongs to the task's block
    // a head always parses, so its block does too
    const why = range?.start === i && offRule(parseBlock(lines.slice(i, range.end))!, home)
    return why ? [[i, why]] : []
  })
}

/**
 * The days a task falls on, for the index. Until fixed, a line off the rule is `off` on the day its SCHEDULED says,
 * and shows on that day only, wherever it lives. Nothing else of a daily shows: nothing sits below a day.
 */
export function indexedDates(block: OrgBlock, home: Place): (TaskDate & { off: boolean })[] {
  const why = offRule(block, home)
  return taskDates(block).flatMap((d) => {
    // off the rule means a SCHEDULED is there
    const off = !!why && d.date === block.scheduled!.date && !holds(home, d.date)
    return home.kind !== 'day' || off ? [{ ...d, off }] : []
  })
}

/** Like showsAt, but a date off the rule shows on that day only, wherever the task lives. */
export function showsEntry(entry: { home: Place; date: string; off: boolean }, here: Place): boolean {
  return entry.off ? here.kind === 'day' && here.key === entry.date : showsAt(entry.home, entry.date, here)
}
