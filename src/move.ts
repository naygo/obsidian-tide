import { findBlock } from './actions'
import { type Place, holds } from './ladder'
import { formatTimestamp, parseBlock } from './org'

const leadOf = (l: string) => l.match(/^\s*/)![0]

/** The first day of a day, week (its Monday), month or year key. */
function firstDay({ kind, key }: Place): string {
  if (kind === 'month') return `${key}-01`
  if (kind === 'year') return `${key}-01-01`
  if (kind !== 'week') return key
  // January 4th is always in week 1
  const jan4 = new Date(Date.UTC(Number(key.slice(0, 4)), 0, 4))
  const monday = 4 - ((jan4.getUTCDay() + 6) % 7) + (Number(key.slice(6)) - 1) * 7
  return new Date(Date.UTC(jan4.getUTCFullYear(), 0, monday)).toISOString().slice(0, 10)
}

/**
 * Move to… (org's refile) on the block around `cursor`: the block leaves `source` and goes in `moved`,
 * dedented to the top level, for the caller to append at the destination.
 */
export function moveBlock(
  lines: string[],
  cursor: number,
  dest: Place,
  today: string,
): { source: string[]; moved: string[] | null } | null {
  const range = findBlock(lines, cursor)
  if (!range) return null
  const old = lines.slice(range.start, range.end)
  const block = parseBlock(old)!
  const out = [...old]
  const s = block.scheduled
  const at = block.planning.indexOf('SCHEDULED') + 1
  // a repeater lives in its list: a period postpones it there, only another list takes it away
  const postpone = !!s?.repeater && dest.kind !== 'list'
  const date = !s
    ? null
    : dest.kind === 'day'
      ? dest.key
      : holds(dest, s.date)
        ? s.date
        : postpone
          ? holds(dest, today)
            ? today
            : firstDay(dest)
          : null
  if (s && date !== s.date) {
    if (date) out[at] = `${leadOf(old[at])}SCHEDULED: ${formatTimestamp({ ...s, date }, true)}`
    else out.splice(at, 1)
  }
  if (postpone) return { source: [...lines.slice(0, range.start), ...out, ...lines.slice(range.end)], moved: null }
  const cut = block.indent.length
  return {
    source: [...lines.slice(0, range.start), ...lines.slice(range.end)],
    moved: out.map((l) => l.slice(Math.min(cut, leadOf(l).length))),
  }
}
