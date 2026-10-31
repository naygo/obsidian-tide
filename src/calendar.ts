import { firstDay, isoWeek } from './ladder'
import { shiftDate } from './org'

/** The ISO weeks that touch a YYYY-MM month, each with its seven days from Monday, spilling into the months around. */
export function monthWeeks(month: string): { week: string; days: string[] }[] {
  const weeks = []
  const next = shiftMonth(month, 1)
  for (let monday = firstDay({ kind: 'week', key: isoWeek(`${month}-01`).week }); monday < `${next}-01`;) {
    const days = Array.from({ length: 7 }, (_, i) => shiftDate(monday, `+${i}d`))
    weeks.push({ week: isoWeek(monday).week, days })
    monday = shiftDate(monday, '+1w')
  }
  return weeks
}

/** The YYYY-MM month `n` months away. */
export const shiftMonth = (month: string, n: number) => shiftDate(`${month}-01`, `+${n}m`).slice(0, 7)

/** The days of a YYYY-MM month, the 1st first. */
export const monthDays = (month: string) => monthWeeks(month).flatMap((w) => w.days.filter((d) => d.startsWith(month)))

/** The days of a YYYY year in columns of seven from Monday, null where a column spills out of the year. */
export function yearWeeks(year: string): (string | null)[][] {
  const weeks = []
  for (let monday = firstDay({ kind: 'week', key: isoWeek(`${year}-01-01`).week }); monday <= `${year}-12-31`;) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => shiftDate(monday, `+${i}d`)).map((d) => (d.startsWith(year) ? d : null)),
    )
    monday = shiftDate(monday, '+1w')
  }
  return weeks
}
