import { t } from './i18n'
import {
  type OrgBlock,
  STATES,
  type State,
  type Timestamp,
  formatTimestamp,
  parseBlock,
  parseHead,
  serializeClosed,
  serializeHead,
  shiftDate,
  stamp,
} from './org'

/** nextBox is a click on the Padrão checkbox: nextState without the loose item, so CANCELED wraps to TODO */
export type Action = 'nextState' | 'prevState' | 'priorityUp' | 'priorityDown' | 'nextBox'

/** Offsets into lines.join("\n"), all relative to the original document. */
export interface Change {
  from: number
  to: number
  insert: string
}

const RING: (State | null)[] = [null, ...STATES]
const BOX: (State | null)[] = [...STATES]
const CLOSED_STATES: (State | null)[] = ['DONE', 'CANCELED']
// Org's default: from no cookie both directions start at B; past the ends, the cookie goes away.
const PRIORITY_UP = { none: 'B', A: null, B: 'A', C: 'B' } as const
const PRIORITY_DOWN = { none: 'B', A: 'B', B: 'C', C: null } as const

/** Edits for an org key press with the cursor on `cursorLine`, or null when it doesn't apply. */
export function orgAction(lines: string[], cursorLine: number, action: Action, now: Date): Change[] | null {
  const range = findBlock(lines, cursorLine)
  if (!range) return null
  const old = lines.slice(range.start, range.end)
  const block = parseBlock(old)!
  const next = transition(block, action, now)
  if (!next) return null
  // touch only the head, the CLOSED line and, on a repeat, SCHEDULED and the logbook; the rest stays as written
  const out = [serializeHead(next), ...old.slice(1)]
  // a repeat: log the occurrence and move SCHEDULED; bottom-up, so the CLOSED splice below keeps its index
  if (next.scheduled !== block.scheduled) {
    const entry = `- State "DONE" from "${block.state}" [${stamp(now).date}] (${t('logbook.occurrence')} ${block.scheduled!.date})`
    const drawersEnd = old.length - block.body.length
    const open = old.findIndex((l, i) => i < drawersEnd && l.trim() === ':LOGBOOK:')
    if (block.logbook) out.splice(open + block.logbook.length + 1, 0, leadOf(old[open]) + entry)
    else
      out.splice(drawersEnd, 0, `${block.childIndent}:LOGBOOK:`, block.childIndent + entry, `${block.childIndent}:END:`)
    const at = block.planning.indexOf('SCHEDULED') + 1
    out[at] = `${leadOf(old[at])}SCHEDULED: ${formatTimestamp(next.scheduled!, true)}`
  }
  const closedAt = block.planning.indexOf('CLOSED') + 1
  if (next.closed && !closedAt) out.splice(block.planning.length + 1, 0, serializeClosed(next))
  if (!next.closed && closedAt) out.splice(closedAt, 1)
  const base = lines.slice(0, range.start).reduce((n, l) => n + l.length + 1, 0)
  return diffLines(old, out).map((c) => ({ ...c, from: c.from + base, to: c.to + base }))
}

function transition(b: OrgBlock, action: Action, now: Date): OrgBlock | null {
  if (action === 'priorityUp' || action === 'priorityDown') {
    if (!b.state) return null
    const table = action === 'priorityUp' ? PRIORITY_UP : PRIORITY_DOWN
    return { ...b, priority: table[b.priority ?? 'none'] }
  }
  if (!b.state && action === 'prevState') return null
  const ring = action === 'nextBox' ? BOX : RING
  const i = ring.indexOf(b.state)
  const state = ring[(i + (action === 'prevState' ? ring.length - 1 : 1)) % ring.length]
  // completing a repeating task sends it back to TODO on its next date, without CLOSED;
  // stepping back from CANCELED is not a completion, so it lands on DONE like any task
  if (state === 'DONE' && action !== 'prevState' && b.scheduled?.repeater) {
    return {
      ...b,
      state: 'TODO',
      closed: null,
      scheduled: { ...b.scheduled, date: shiftDate(b.scheduled.date, b.scheduled.repeater) },
    }
  }
  const closing = CLOSED_STATES.includes(state)
  const closed = !closing ? null : CLOSED_STATES.includes(b.state) && b.closed ? b.closed : stamp(now)
  return { ...b, state, closed }
}

export const leadOf = (l: string) => l.match(/^\s*/)![0]
const indentOf = (l: string) => leadOf(l).length

/**
 * The task block around the cursor: the nearest enclosing list item with a keyword,
 * else the outermost enclosing plain list item (a loose item). Steps never own a block.
 */
export function findBlock(lines: string[], cursor: number): { start: number; end: number } | null {
  if (!lines[cursor]?.trim()) return null
  let head = -1
  let limit = Infinity
  for (let i = cursor; i >= 0 && limit > 0; i--) {
    if (!lines[i].trim()) continue
    const ind = indentOf(lines[i])
    if (ind >= limit) continue
    limit = ind
    const h = parseHead(lines[i])
    if (!h) continue
    head = i
    if (h.state) break
  }
  if (head < 0) return null
  const ind = indentOf(lines[head])
  let end = head + 1
  while (end < lines.length && (!lines[end].trim() || indentOf(lines[end]) > ind)) end++
  while (end > head + 1 && !lines[end - 1].trim()) end--
  return { start: head, end }
}

/**
 * Where Enter inside a task block opens an indented line: after `after`, with `indent`. On the head, planning or a
 * drawer that is after the drawers, so the parser still reads them, and only from the end of the line: splitting them
 * would break the task. Null leaves Enter as usual (steps and bullets go on as lists).
 */
export function enterAt(lines: string[], line: number, atEnd = true): { after: number; indent: string } | null {
  const range = findBlock(lines, line)
  if (!range || !parseHead(lines[range.start])?.state) return null
  const block = parseBlock(lines.slice(range.start, range.end))!
  const lastMeta = range.end - block.body.length - 1
  if (line <= lastMeta) return atEnd ? { after: lastMeta, indent: block.childIndent } : null
  return /^\s*- /.test(lines[line]) ? null : { after: line, indent: leadOf(lines[line]) }
}

/** Each task head with lines under it and the last of those lines: what Ctrl+Alt+Tab and the Padrão visual fold. */
export function taskFolds(lines: string[]): { head: number; end: number }[] {
  return lines.flatMap((l, head) => {
    if (!parseHead(l)?.state) return []
    const { start, end } = findBlock(lines, head)!
    return end - start > 1 ? [{ head, end: end - 1 }] : []
  })
}

const when = (ts: Timestamp) => [ts.date, ts.time, ts.repeater].filter(Boolean).join(' ')

/** The folded details of a task in one line: SCHEDULED, DEADLINE and the steps done. */
export function summary(lines: string[]): string {
  const b = parseBlock(lines)!
  const parts = [
    b.scheduled && when(b.scheduled),
    b.deadline && `${t('block.deadline')} ${when(b.deadline)}`,
    b.steps.length && `${b.steps.filter((s) => s.checked).length}/${b.steps.length}`,
  ].filter(Boolean)
  return parts.join(' · ')
}

/** Line-level LCS diff, so untouched lines (and the cursor on them) stay put. */
export function diffLines(a: string[], b: string[]): Change[] {
  const lcs = a.map(() => new Array<number>(b.length + 1).fill(0))
  lcs.push(new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])

  const starts = [0]
  for (const l of a) starts.push(starts[starts.length - 1] + l.length + 1)
  const total = starts[a.length] - 1
  const changes: Change[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i++
      j++
      continue
    }
    const [i0, j0] = [i, j]
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) break
      if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) j++
      else i++
    }
    // line for line when the counts match, so each changed line is trimmed on its own
    if (i - i0 === j - j0)
      for (let k = 0; k < i - i0; k++) changes.push(hunk([a[i0 + k]], [b[j0 + k]], starts[i0 + k], false, total))
    else changes.push(hunk(a.slice(i0, i), b.slice(j0, j), starts[i0], i === a.length, total))
  }
  return changes
}

function hunk(old: string[], next: string[], from: number, atEnd: boolean, total: number): Change {
  if (!old.length) {
    return atEnd
      ? { from: total, to: total, insert: '\n' + next.join('\n') }
      : { from, to: from, insert: next.join('\n') + '\n' }
  }
  const oldText = old.join('\n')
  if (!next.length) {
    return atEnd ? { from: from - 1, to: total, insert: '' } : { from, to: from + oldText.length + 1, insert: '' }
  }
  // trim to the characters that really changed, so a cursor on the line keeps its place
  const insert = next.join('\n')
  let p = 0
  while (p < oldText.length && p < insert.length && oldText[p] === insert[p]) p++
  let s = 0
  while (
    s < oldText.length - p &&
    s < insert.length - p &&
    oldText[oldText.length - 1 - s] === insert[insert.length - 1 - s]
  )
    s++
  return { from: from + p, to: from + oldText.length - s, insert: insert.slice(p, insert.length - s) }
}
