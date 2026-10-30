import { findBlock, leadOf } from './actions'
import { type Place, ended, firstDay, holds, openUndated } from './ladder'
import { type Timestamp, formatTimestamp, parseBlock } from './org'

/**
 * Move to… (org's refile) on the block around `cursor`, which lives at `home`. The block leaves `source` and goes
 * in `moved`, dedented to the top level, for the caller to append at the destination; `moved` is null when the
 * block stays where it is: already at `dest`, or a repeating task of a list postponed to a period.
 */
export function moveBlock(
  lines: string[],
  cursor: number,
  home: Place | null,
  dest: Place,
  today: string,
): { source: string[]; moved: string[] | null } | null {
  const range = findBlock(lines, cursor)
  if (!range) return null
  const old = lines.slice(range.start, range.end)
  const block = parseBlock(old)!
  const out = [...old]
  const s = block.scheduled
  const date = s && scheduledAt(s, dest, today)
  if (s && date !== s.date) {
    const at = block.planning.indexOf('SCHEDULED') + 1
    if (date) out[at] = `${leadOf(old[at])}SCHEDULED: ${formatTimestamp({ ...s, date }, true)}`
    else out.splice(at, 1)
  }
  // a repeater lives in its list: a period postpones it there, only another list takes it away
  const stays =
    (home?.kind === dest.kind && home.key === dest.key) ||
    (!!s?.repeater && home?.kind === 'list' && dest.kind !== 'list')
  if (stays) return { source: [...lines.slice(0, range.start), ...out, ...lines.slice(range.end)], moved: null }
  const cut = block.indent.length
  return {
    source: [...lines.slice(0, range.start), ...lines.slice(range.end)],
    moved: out.map((l) => l.slice(Math.min(cut, leadOf(l).length))),
  }
}

/** The SCHEDULED date at `dest`, or null to drop it. A repeater is never dropped, or the repetition would end. */
function scheduledAt(s: Timestamp, dest: Place, today: string): string | null {
  if (dest.kind === 'day') return dest.key
  if (holds(dest, s.date)) return s.date
  if (!s.repeater) return null
  return holds(dest, today) ? today : firstDay(dest)
}

/** Head lines of the pending tasks: open and undated in a period already over. */
export function pendingIn(lines: string[], home: Place, today: string): number[] {
  return ended(home, today) ? openUndated(lines) : []
}

/** Migrate pending to today: every pending block leaves `lines`, in file order, for the caller to append at today. */
export function migrate(lines: string[], home: Place, today: string): { source: string[]; moved: string[] } | null {
  const heads = pendingIn(lines, home, today)
  if (!heads.length) return null
  const moved: string[][] = []
  let source = lines
  // from the bottom up, so each cut leaves the lines above where they were
  for (const head of heads.reverse()) {
    const result = moveBlock(source, head, home, { kind: 'day', key: today }, today)!
    source = result.source
    moved.unshift(result.moved!)
  }
  return { source, moved: moved.flat() }
}
