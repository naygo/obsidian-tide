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
