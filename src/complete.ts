import { findBlock } from './actions'
import { STATES, formatTimestamp, parseBlock, parseHead, shiftDate, stamp } from './org'

/** Tags and categories already used in the vault. */
export interface Vocabulary {
  tags: string[]
  categories: string[]
}

export interface SuggestContext extends Vocabulary {
  /** the file is a list, the Inbox included: only there a repeater is offered */
  list: boolean
  /** the date of the daily being edited, or null in any other file */
  day: string | null
  now: Date
}

/** label, inserted text and where the cursor lands in it */
type Candidate = [string, string, number?]

export interface Suggestion {
  label: string
  /** what replaces from..to; may span lines */
  text: string
  /** where the cursor lands inside `text`; its end when absent */
  cursor?: number
}

/** Columns from..to on the cursor line are replaced by the chosen suggestion's text. */
export interface Suggestions {
  from: number
  to: number
  items: Suggestion[]
}

const HEAD_WORD = /^\s*- ([A-Z]+)$/
/** the tags typed so far at the end of a head, and the one being typed */
const HEAD_TAGS = /\s:((?:[^\s:]+:)*)([^\s:]*)$/
const CHILD_WORD = /^(\s+)([A-Z]+)$/
const CHILD_DRAWER = /^(\s+)(:[A-Za-z]*)$/
const CATEGORY = /^\s*:CATEGORY: (.*)$/
const DATE = /^\s*(SCHEDULED|DEADLINE): <([\d-]*)$/
/** after the date, its weekday and maybe a time, at the repeater's place */
const REPEATER = /^\s*SCHEDULED: <\d{4}-\d{2}-\d{2} [^\s\d>]+(?: \d{1,2}:\d{2})? (\+\w*)?$/
const REPEATERS = ['+1d', '+1w', '+1m', '+1y']
/** how many days the date suggestion offers, today included */
const DAYS = 7
/** properties offered inside the drawer; :CREATED: only comes in with the drawer itself */
const PROPERTIES = ['CATEGORY', 'ABOUT']

/** What to suggest with the cursor at column `ch` of `line`, or null when nothing applies there. */
export function orgSuggest(lines: string[], line: number, ch: number, ctx: SuggestContext): Suggestions | null {
  const before = lines[line].slice(0, ch)
  // inside a word, a suggestion would only replace its first half
  if (/^[\p{L}\d]/u.test(lines[line].slice(ch))) return null
  const state = HEAD_WORD.exec(before)
  if (state)
    return offer(
      ch,
      state[1],
      STATES.map((s) => [s, s + ' ']),
    )
  const tags = HEAD_TAGS.exec(before)
  if (tags && parseHead(before)) {
    const [, typed, query] = tags
    const has = typed.split(':')
    const fresh = ctx.tags.filter((tag) => !has.includes(tag))
    return offer(
      ch,
      query,
      fresh.map((tag) => [tag, tag + ':']),
    )
  }
  return childSuggest(lines, line, before, ctx)
}

/** Planning keys, the drawer, its properties and categories, on the lines under a head. */
function childSuggest(lines: string[], line: number, before: string, ctx: SuggestContext): Suggestions | null {
  const range = findBlock(lines, line)
  if (!range || range.start === line) return null
  const ch = before.length
  const date = DATE.exec(before)
  if (date) return dateSuggest(date[1], date[2], ch, lines[line].slice(ch), ctx)
  const repeater = REPEATER.exec(before)
  if (repeater)
    return ctx.list
      ? offer(
          ch,
          repeater[1] ?? '',
          REPEATERS.map((r) => [r, r]),
        )
      : null
  // what sits above the cursor in the block, parsed as the parser will read it
  const above = parseBlock(lines.slice(range.start, line))!
  // and the whole block but the cursor line, for what it already has
  const rest = parseBlock([...lines.slice(range.start, line), ...lines.slice(line + 1, range.end)])!

  const word = CHILD_WORD.exec(before)
  if (word) {
    // a planning line only parses right under the head or another one
    if (above.planning.length !== line - range.start - 1) return null
    const keys = (['SCHEDULED', 'DEADLINE'] as const).filter((k) => !rest.planning.includes(k))
    return offer(
      ch,
      word[2],
      keys.map((k) => [k, `${k}: <>`, k.length + 3]),
    )
  }

  const drawerLine = drawerAt(lines, range.start, line)
  if (drawerLine !== null) {
    const category = CATEGORY.exec(before)
    if (category)
      return offer(
        ch,
        category[1],
        ctx.categories.map((c) => [c, c]),
      )
    const drawer = CHILD_DRAWER.exec(before)
    if (!drawer) return null
    const has = drawerNames(lines, drawerLine, line)
    const props = PROPERTIES.filter((p) => !has.includes(p)).map((p): Candidate => [`:${p}:`, `:${p}: `])
    return offer(ch, drawer[2], props)
  }

  const drawer = CHILD_DRAWER.exec(before)
  // the drawer only parses after the planning lines, and a block has one
  if (!drawer || above.body.length || rest.properties) return null
  const ind = drawer[1]
  const created = `${ind}:CREATED: ${formatTimestamp(stamp(ctx.now), false)}`
  const text = `:PROPERTIES:\n${created}\n${ind}:END:`
  return offer(ch, drawer[2], [[':PROPERTIES:', text, text.lastIndexOf('\n')]])
}

/** Dates with their weekday: the coming days, or the one typed in full. In a daily, SCHEDULED only keeps the time. */
function dateSuggest(key: string, query: string, ch: number, after: string, ctx: SuggestContext): Suggestions {
  let dates: string[] = []
  if (key === 'SCHEDULED' && ctx.day) dates = [ctx.day]
  else {
    for (let d = stamp(ctx.now).date; dates.length < DAYS; d = shiftDate(d, '+1d')) dates.push(d)
    if (isDate(query) && !dates.includes(query)) dates.push(query)
  }
  const close = after.startsWith('>') ? '' : '>'
  return offer(
    ch,
    query,
    dates.map((d): Candidate => {
      const label = formatTimestamp({ date: d, time: null, repeater: null }, true).slice(1, -1)
      // the cursor stays inside the brackets, for a time or a repeater
      return [label, label + close, close ? label.length : undefined]
    }),
  )
}

/** A real YYYY-MM-DD date: 2026-02-30 is not one. */
function isDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toISOString().startsWith(s)
}

/** The line of the :PROPERTIES: the cursor line sits in, between the head and the cursor, or null outside one. */
function drawerAt(lines: string[], head: number, line: number): number | null {
  for (let i = line - 1; i > head; i--) {
    const l = lines[i].trim()
    if (l === ':END:') return null
    if (l === ':PROPERTIES:') return i
  }
  return null
}

/** The property names in the drawer opened at `drawerLine`, but the one on the cursor line. */
function drawerNames(lines: string[], drawerLine: number, line: number): string[] {
  const names: string[] = []
  for (let i = drawerLine + 1; i < lines.length && lines[i].trim() !== ':END:'; i++) {
    const m = /^\s*:([^\s:]+):/.exec(lines[i])
    if (m && i !== line) names.push(m[1])
  }
  return names
}

/**
 * The candidates starting with the query typed up to column `ch`, never one equal to it: a word typed in full is not
 * offered again.
 */
function offer(ch: number, query: string, candidates: Candidate[]): Suggestions {
  const q = query.toLowerCase()
  const items = candidates
    .filter(([label]) => label.toLowerCase().startsWith(q) && label.toLowerCase() !== q)
    .map(([label, text, cursor]) => (cursor === undefined ? { label, text } : { label, text, cursor }))
  return { from: ch - query.length, to: ch, items }
}

/** The tags and categories written in a note, each once, for the index to offer across the vault. */
export function vocabulary(lines: string[]): Vocabulary {
  const tags = new Set<string>()
  const categories = new Set<string>()
  lines.forEach((l, i) => {
    const head = parseHead(l)
    if (!head) return
    head.tags.forEach((tag) => tags.add(tag))
    const range = findBlock(lines, i)
    // a loose item inside a task belongs to the task's block
    if (range?.start !== i) return
    const category = parseBlock(lines.slice(i, range.end))!.properties?.find(([k]) => k === 'CATEGORY')?.[1]
    if (category) categories.add(category)
  })
  return { tags: [...tags], categories: [...categories] }
}
