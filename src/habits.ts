import { keyOf } from './ladder'

/** A habit: a note marked as one, its frontmatter read with the property names in en. */
export interface Habit {
  /** the note's name, which is also the key of its mark in a daily's frontmatter */
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

/** Planned on the date's weekday and not archived. */
export function plannedOn(h: Habit, date: string): boolean {
  const [y, m, d] = date.split('-').map(Number)
  return !h.archived && (!h.days || h.days.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay()))
}

/** Marks with `true`, or unmarks by deleting the property; for processFrontMatter. */
export function toggleMark(fm: Record<string, unknown>, name: string) {
  if (isMarked(fm, name)) delete fm[name]
  else fm[name] = true
}

/** A mark as an amount: `true` is 1, a number or a numeric string is its number, anything else 0. */
export function amountOf(fm: Record<string, unknown> | null | undefined, name: string): number {
  const value = fm?.[name]
  if (value === true) return 1
  const n = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** A missing property is not marked, never "failed"; marked is what counts toward the goal. */
export const isMarked = (fm: Record<string, unknown> | null | undefined, name: string) => amountOf(fm, name) > 0

/** Writes a quantity, or unmarks on 0 or no number, so a mark is never 0; for processFrontMatter. */
export function setAmount(fm: Record<string, unknown>, name: string, n: number) {
  if (n > 0) fm[name] = n
  else delete fm[name]
}

/** The amounts by date summed over the goal's period that holds `date`; a mark off the planned days counts the same. */
export function progress(h: Habit, date: string, amounts: Record<string, number>): number {
  if (!h.goal) return 0
  const { per } = h.goal
  const key = keyOf(per, date)
  return Object.entries(amounts).reduce((sum, [d, n]) => (keyOf(per, d) === key ? sum + n : sum), 0)
}

/** Whether any note already uses `name` as a property, ignoring case as Obsidian's properties do. */
export const propertyUsed = (name: string, frontmatters: (Record<string, unknown> | null)[]) =>
  frontmatters.some((fm) => Object.keys(fm ?? {}).some((key) => key.toLowerCase() === name.toLowerCase()))
