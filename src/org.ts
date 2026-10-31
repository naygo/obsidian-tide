import { type MessageKey, t } from './i18n'

export const STATES = ['TODO', 'DOING', 'DONE', 'CANCELED'] as const
export type State = (typeof STATES)[number]
export type Priority = 'A' | 'B' | 'C'
export type PlanningKey = 'SCHEDULED' | 'DEADLINE' | 'CLOSED'

export interface Timestamp {
  date: string
  time: string | null
  repeater: string | null
}

export interface Step {
  checked: boolean
  text: string
}

export interface OrgBlock {
  /** task has a keyword; event is a keywordless line with SCHEDULED; note is anything else */
  kind: 'task' | 'event' | 'note'
  indent: string
  childIndent: string
  state: State | null
  priority: Priority | null
  title: string
  /** whitespace between title and tags, kept so tag alignment survives a round trip */
  tagsGap: string
  tags: string[]
  scheduled: Timestamp | null
  deadline: Timestamp | null
  closed: Timestamp | null
  /** planning lines right under the head, in the order they were written */
  planning: PlanningKey[]
  properties: [string, string][] | null
  /** raw lines between :LOGBOOK: and :END: */
  logbook: string[] | null
  /** raw description and step lines */
  body: string[]
  steps: Step[]
}

const HEAD = new RegExp(
  String.raw`^(\s*)- (?!\[[ xX-]\] )(?:(${STATES.join('|')})(?: |$))?(?:\[#([ABC])\](?: |$))?(.*)$`,
)
const TAGS = /^(.*?)(\s+):((?:[^\s:]+:)+)$/
const PLANNING =
  /^\s*(SCHEDULED|DEADLINE|CLOSED): ([<[])(\d{4}-\d{2}-\d{2})(?: ([^\s\d>\]+]+))?(?: (\d{1,2}:\d{2}))?(?: (\+\d+[dwmy]))?([>\]])$/
const PROPERTY = /^\s*:([^\s:]+):(?: (.*))?$/
const STEP = /^\s*- \[([ xX])\] (.*)$/

/** Head line of a list item that can carry a task (checkbox steps can't). */
export function parseHead(line: string) {
  const m = HEAD.exec(line)
  if (!m) return null
  const [, indent, state, priority, rest] = m
  const t = TAGS.exec(rest)
  return {
    indent,
    state: (state as State) ?? null,
    priority: (priority as Priority) ?? null,
    title: t ? t[1] : rest,
    tagsGap: t ? t[2] : '',
    tags: t ? t[3].slice(0, -1).split(':') : [],
  }
}

/** The head line a quick capture appends: one line, a TODO unless TODO or DOING was typed. Null for blank text. */
export function captureLine(text: string): string | null {
  const rest = text
    .replace(/\s*\n\s*/g, ' ')
    .trim()
    .replace(/^- /, '')
  if (!rest) return null
  // a DONE or CANCELED would need its CLOSED line, so only an open state is kept
  const state = parseHead(`- ${rest}`)?.state
  return state === 'TODO' || state === 'DOING' ? `- ${rest}` : `- TODO ${rest}`
}

export function parseBlock(lines: string[]): OrgBlock | null {
  const head = parseHead(lines[0])
  if (!head) return null
  const rest = lines.slice(1)
  const childIndent = rest.find((l) => l.trim())?.match(/^\s*/)![0] ?? head.indent + '  '

  const planning: Partial<Record<PlanningKey, Timestamp>> = {}
  const order: PlanningKey[] = []
  let i = 0
  for (; i < rest.length; i++) {
    const m = PLANNING.exec(rest[i])
    if (!m) break
    const key = m[1] as PlanningKey
    // brackets must match the keyword: CLOSED is inactive [..], the others active <..>
    if ((key === 'CLOSED') !== (m[2] === '[') || (m[2] === '[') !== (m[7] === ']') || planning[key]) break
    planning[key] = { date: m[3], time: m[5] ?? null, repeater: m[6] ?? null }
    order.push(key)
  }

  let properties: [string, string][] | null = null
  let logbook: string[] | null = null
  for (;;) {
    const name = rest[i]?.trim()
    const end = rest.findIndex((l, j) => j > i && l.trim() === ':END:')
    if (end < 0) break
    if (name === ':PROPERTIES:' && !properties) {
      const props = rest.slice(i + 1, end).map((l) => PROPERTY.exec(l))
      if (props.some((p) => !p)) break
      properties = props.map((p) => [p![1], p![2] ?? ''])
    } else if (name === ':LOGBOOK:' && !logbook) {
      logbook = rest.slice(i + 1, end)
    } else break
    i = end + 1
  }

  const body = rest.slice(i)
  const scheduled = planning.SCHEDULED ?? null
  return {
    ...head,
    kind: head.state ? 'task' : scheduled ? 'event' : 'note',
    childIndent,
    scheduled,
    deadline: planning.DEADLINE ?? null,
    closed: planning.CLOSED ?? null,
    planning: order,
    properties,
    logbook,
    body,
    steps: body.flatMap((l) => {
      const m = STEP.exec(l)
      return m ? [{ checked: m[1] !== ' ', text: m[2] }] : []
    }),
  }
}

/** The weekday is decorative: the parser skips it and it is written from the date, in the UI language. */
export function formatTimestamp(ts: Timestamp, active: boolean): string {
  const inner = [ts.date, weekday(ts.date), ts.time, ts.repeater].filter(Boolean).join(' ')
  return active ? `<${inner}>` : `[${inner}]`
}

/** The weekday of a YYYY-MM-DD date, abbreviated in the UI language. */
export function weekday(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return t(`weekday.${new Date(y, m - 1, d).getDay()}` as MessageKey)
}

/** The local date and time of `d`, as written in CLOSED and :CREATED:. */
export function stamp(d: Date): Timestamp {
  const p = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
    repeater: null,
  }
}

export function serializeHead(b: OrgBlock): string {
  const title = [b.state, b.priority && `[#${b.priority}]`, b.title].filter(Boolean).join(' ')
  return b.indent + '- ' + title + (b.tags.length ? `${b.tagsGap || ' '}:${b.tags.join(':')}:` : '')
}

export function serializeClosed(b: OrgBlock): string {
  return `${b.childIndent}CLOSED: ${formatTimestamp(b.closed!, false)}`
}

export function serializeBlock(b: OrgBlock): string[] {
  const c = b.childIndent
  const out = [serializeHead(b)]
  if (b.scheduled) out.push(`${c}SCHEDULED: ${formatTimestamp(b.scheduled, true)}`)
  if (b.deadline) out.push(`${c}DEADLINE: ${formatTimestamp(b.deadline, true)}`)
  if (b.closed) out.push(serializeClosed(b))
  if (b.properties) {
    out.push(`${c}:PROPERTIES:`, ...b.properties.map(([k, v]) => `${c}:${k}:${v ? ' ' + v : ''}`), `${c}:END:`)
  }
  if (b.logbook) out.push(`${c}:LOGBOOK:`, ...b.logbook, `${c}:END:`)
  return out.concat(b.body)
}

/**
 * The date one repeater step (`+1d`, `+2w`, `+1m`, `+1y`) after `date`.
 * Months and years past the end of the target month land on its last day.
 * ponytail: only the shifted date is stored, so a task on the 31st drifts to the 28th for good after February;
 * keep the original day somewhere if that matters.
 */
export function shiftDate(date: string, repeater: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const n = Number(repeater.slice(1, -1))
  const unit = repeater.slice(-1)
  if (unit === 'd' || unit === 'w') return isoDate(new Date(Date.UTC(y, m - 1, d + n * (unit === 'w' ? 7 : 1))))
  const month = m - 1 + n * (unit === 'y' ? 12 : 1)
  const last = new Date(Date.UTC(y, month + 1, 0)).getUTCDate()
  return isoDate(new Date(Date.UTC(y, month, Math.min(d, last))))
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10)
