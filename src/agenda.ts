import { type TaskDate, taskDates } from './ladder'
import { type ListedTask, isOpen } from './list'
import { shiftDate } from './org'

export interface AgendaEntry extends TaskDate {
  task: ListedTask
  time: string | null
}

export interface Agenda {
  /** open tasks with a SCHEDULED or DEADLINE gone by, once each, on their first such date */
  overdue: AgendaEntry[]
  /** the pending tasks, minus those already overdue */
  pending: ListedTask[]
  /** today and the next 6 days, each with what falls on it */
  days: { date: string; entries: AgendaEntry[] }[]
}

/** The days a task or event falls on: its dates, or the day of its daily when it has no SCHEDULED. */
function datesOf({ block, home }: ListedTask): TaskDate[] {
  const dates = taskDates(block)
  if (home?.kind === 'day' && !block.scheduled && block.deadline?.date !== home.key)
    dates.unshift({ date: home.key, kind: 'scheduled' })
  return dates
}

const timeOf = (task: ListedTask, d: TaskDate) =>
  (d.kind === 'scheduled' ? task.block.scheduled : task.block.deadline)?.time ?? null

/**
 * The org agenda of `items`, the tasks and events of the vault, on `today`; `pending` comes from the index, so it
 * matches what Migrate pending to today moves. What lives off the ladder never shows, as on the ladder.
 * ponytail: a repeater shows on its next SCHEDULED only, not on each occurrence in the 7 days as in org.
 */
export function agenda(items: ListedTask[], pending: ListedTask[], today: string): Agenda {
  const onLadder = items.filter((t) => t.home)
  const entry = (task: ListedTask, d: TaskDate): AgendaEntry => ({ ...d, task, time: timeOf(task, d) })
  // events never count as work, and the day of a daily is not a date that goes by: undated, it is pending
  const overdue = onLadder.flatMap((task) => {
    const late = task.block.kind === 'task' && isOpen(task.block) && taskDates(task.block).find((d) => d.date < today)
    return late ? [entry(task, late)] : []
  })
  const late = new Set(overdue.map((e) => e.task))
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(today, `+${i}d`))
  const byTime = (a: AgendaEntry, b: AgendaEntry) =>
    Number(!a.time) - Number(!b.time) ||
    (a.time ?? '').padStart(5, '0').localeCompare((b.time ?? '').padStart(5, '0')) ||
    a.task.path.localeCompare(b.task.path) ||
    a.task.line - b.task.line
  return {
    overdue: overdue.sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b)),
    pending: pending.filter((t) => !late.has(t)),
    days: days.map((date) => ({
      date,
      entries: onLadder
        .flatMap((task) => datesOf(task).flatMap((d) => (d.date === date ? [entry(task, d)] : [])))
        .sort(byTime),
    })),
  }
}
