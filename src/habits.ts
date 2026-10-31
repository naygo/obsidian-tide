import { keyOf } from './ladder'
import { shiftDate } from './org'

/** A habit: a note marked as one, its frontmatter read with the property names in en. */
export interface Habit {
  /** the note's name */
  name: string
  path: string
  /** null is a yes/no habit */
  unit: string | null
  /** weekdays it is planned on, Sunday as 0; null is every day */
  days: number[] | null
  icon: string | null
  color: string | null
  archived: boolean
  /** goal_per: day only with a unit; anything else invalid is no goal */
  goal: Goal | null
}

export type GoalPer = 'day' | 'week' | 'month' | 'year'

export interface Goal {
  amount: number
  per: GoalPer
}

/** The icon keys a habit may take, Lucide names as Obsidian's setIcon draws them. */
export const ICONS = [
  'dumbbell',
  'bike',
  'footprints',
  'heart',
  'droplet',
  'apple',
  'pill',
  'moon',
  'sun',
  'bed',
  'book-open',
  'pen',
  'code',
  'music',
  'brain',
  'flower-2',
  'leaf',
  'coffee',
  'briefcase',
  'check',
  'star',
] as const

/** The color keys a habit may take, Obsidian's own palette; styles.css has a class for each. */
export const COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'] as const

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const allowed = (list: readonly string[], value: unknown) =>
  typeof value === 'string' && list.includes(value) ? value : null

/** `[mon, wed]`, `mon, wed` or full names; nothing understood is every day, so a typo never hides the habit. */
function daysOf(value: unknown): number[] | null {
  const names = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const days = names.map((n) => WEEKDAYS.indexOf(String(n).trim().slice(0, 3).toLowerCase())).filter((d) => d >= 0)
  return days.length ? days : null
}

const GOAL_PERS: readonly string[] = ['day', 'week', 'month', 'year'] satisfies GoalPer[]

/** A positive goal with a known goal_per; a goal without goal_per is no goal, as is `day` on a yes/no habit. */
function goalOf(fm: Record<string, unknown> | null | undefined, unit: string | null): Goal | null {
  const amount = Number(fm?.goal)
  const per = fm?.goal_per
  if (!(amount > 0) || typeof per !== 'string' || !GOAL_PERS.includes(per) || (per === 'day' && !unit)) return null
  return { amount, per: per as GoalPer }
}

/** The habit of a note marked as one, from its path and frontmatter. */
export function habitOf(path: string, fm: Record<string, unknown> | null | undefined): Habit {
  const raw = fm?.unit
  const unit = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() || null : null
  return {
    name: path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, ''),
    path,
    unit,
    days: daysOf(fm?.days),
    icon: allowed(ICONS, fm?.icon),
    color: allowed(COLORS, fm?.color),
    archived: fm?.archived === true,
    goal: goalOf(fm, unit),
  }
}

/** The properties a new habit note is born with, empty: yes/no, every day, no goal, not archived. */
export const HABIT_PROPERTIES = {
  unit: null,
  days: null,
  goal: null,
  goal_per: null,
  icon: null,
  color: null,
  archived: false,
}

/** Planned on the date's weekday and not archived. */
export function plannedOn(h: Habit, date: string): boolean {
  const [y, m, d] = date.split('-').map(Number)
  return !h.archived && (!h.days || h.days.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay()))
}

/** The heading of a habit note's log: one line per marked day, a link to its daily and the amount when it has a unit. */
export const LOG_HEADING = '## registro'
const LOG = /^##\s+registro\s*$/i
const MARK = /^- \[\[([^\]|#]+)(?:\|[^\]]*)?\]\](?:\s+(\d+(?:[.,]\d+)?))?\s*$/

/** The lines of the log: from its heading to the next heading or the end; null with no heading. */
function logRange(lines: string[]): [number, number] | null {
  const start = lines.findIndex((l) => LOG.test(l))
  if (start < 0) return null
  const next = lines.findIndex((l, i) => i > start && /^#{1,6}\s/.test(l))
  return [start, next < 0 ? lines.length : next]
}

const markOf = (line: string) => {
  const m = MARK.exec(line)
  return m ? { name: m[1].trim(), amount: m[2] ? Number(m[2].replace(',', '.')) : 1 } : null
}

/** The amount of each daily name in the log of a habit note; a line with no number is 1, a 0 is no mark. */
export function marksIn(content: string): Record<string, number> {
  const lines = content.split('\n')
  const range = logRange(lines)
  const out: Record<string, number> = {}
  if (!range) return out
  for (const line of lines.slice(range[0] + 1, range[1])) {
    const m = markOf(line)
    if (m && m.amount > 0) out[m.name] = (out[m.name] ?? 0) + m.amount
  }
  return out
}

/**
 * The habit note with the mark of the daily `name` set to `amount`: its lines replaced by one, in date order so two
 * devices merge cleanly, or removed on 0. A habit with no unit writes the link alone. The heading is added when missing.
 */
export function writeMark(content: string, name: string, amount: number, unit: boolean): string {
  let lines = content.split('\n')
  let range = logRange(lines)
  if (!range) {
    if (!(amount > 0)) return content
    const body = content.replace(/\s*$/, '')
    lines = `${body}${body ? '\n\n' : ''}${LOG_HEADING}\n`.split('\n')
    range = logRange(lines)!
  }
  const [start] = range
  let end = range[1]
  for (let i = end - 1; i > start; i--)
    if (markOf(lines[i])?.name === name) {
      lines.splice(i, 1)
      end--
    }
  if (amount > 0) {
    let at = start + 1
    for (let i = start + 1; i < end; i++) {
      const m = markOf(lines[i])
      if (m && m.name < name) at = i + 1
    }
    lines.splice(at, 0, unit ? `- [[${name}]] ${amount}` : `- [[${name}]]`)
  }
  return lines.join('\n')
}

/** The amounts by date summed over the goal's period that holds `date`; a mark off the planned days counts the same. */
export function progress(h: Habit, date: string, amounts: Record<string, number>): number {
  if (!h.goal) return 0
  const { per } = h.goal
  const key = keyOf(per, date)
  return Object.entries(amounts).reduce((sum, [d, n]) => (keyOf(per, d) === key ? sum + n : sum), 0)
}

/** The goal's pace on `date`: done in its period, what is left to meet it, and the days left there, `date` included. */
export function pace(h: Habit, date: string, amounts: Record<string, number>) {
  if (!h.goal) return null
  const done = progress(h, date, amounts)
  const key = keyOf(h.goal.per, date)
  let daysLeft = 0
  for (let d = date; keyOf(h.goal.per, d) === key; d = shiftDate(d, '+1d')) daysLeft++
  return { goal: h.goal, done, left: Math.max(0, h.goal.amount - done), daysLeft }
}
