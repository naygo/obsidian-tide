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

/** The habit of a note marked as one, from its path and frontmatter. */
export function habitOf(path: string, fm: Record<string, unknown> | null | undefined): Habit {
  const unit = fm?.unit
  return {
    name: path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, ''),
    path,
    unit: typeof unit === 'string' || typeof unit === 'number' ? String(unit).trim() || null : null,
    days: daysOf(fm?.days),
    icon: allowed(ICONS, fm?.icon),
    color: allowed(COLORS, fm?.color),
    archived: fm?.archived === true,
  }
}

/** Planned on the date's weekday and not archived. */
export function plannedOn(h: Habit, date: string): boolean {
  const [y, m, d] = date.split('-').map(Number)
  return !h.archived && (!h.days || h.days.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay()))
}

/** A missing property is not marked, never "failed". */
export const isMarked = (fm: Record<string, unknown> | null | undefined, name: string) =>
  fm?.[name] != null && fm[name] !== false

/** Marks with `true`, or unmarks by deleting the property; for processFrontMatter. */
export function toggleMark(fm: Record<string, unknown>, name: string) {
  if (isMarked(fm, name)) delete fm[name]
  else fm[name] = true
}

/** Whether any note already uses `name` as a property, ignoring case as Obsidian's properties do. */
export const propertyUsed = (name: string, frontmatters: (Record<string, unknown> | null)[]) =>
  frontmatters.some((fm) => Object.keys(fm ?? {}).some((key) => key.toLowerCase() === name.toLowerCase()))
