/** A declaration of a context: its habits are paused from `from` to `to`, both days included. */
export interface Declaration {
  from: string
  to: string
  /** the habits' note names, without folder or alias */
  habits: string[]
}

const DATE = String.raw`\d{4}-\d{2}-\d{2}`
const LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g
const DECLARATION = new RegExp(String.raw`^\s*[-*]\s+(${DATE})\s*(?:→|->)\s*(${DATE})((?:\s*\[\[[^\]]+\]\])+)\s*$`)

const noteName = (link: string) => link.slice(link.lastIndexOf('/') + 1).trim()

/** `- 2026-11-01 → 2026-11-07 [[gym]] [[leitura]]`; any other line is no declaration. */
export function parseDeclaration(line: string): Declaration | null {
  const m = DECLARATION.exec(line)
  return m ? { from: m[1], to: m[2], habits: [...m[3].matchAll(LINK)].map((l) => noteName(l[1])) } : null
}

/** Every declaration line of a note. */
export const declarationsIn = (lines: string[]): Declaration[] => lines.flatMap((line) => parseDeclaration(line) ?? [])

/** The habits paused on `date`, lowercased as Obsidian's links ignore case. */
export const pausedOn = (declarations: Declaration[], date: string) =>
  new Set(
    declarations.filter((d) => d.from <= date && date <= d.to).flatMap((d) => d.habits.map((h) => h.toLowerCase())),
  )

/** The line Declare context appends: the note's `pause` copied once, so later edits to it leave the line as it was. */
export function declarationLine(from: string, to: string, pause: unknown): string | null {
  // unquoted `[[[gym]]]` is YAML for nested arrays; the Properties UI writes `[[gym]]` strings
  const names = [pause].flat(Infinity).flatMap((v) => {
    if (typeof v !== 'string') return []
    const links = [...v.matchAll(LINK)].map((l) => l[1])
    return (links.length ? links : [v]).map(noteName).filter(Boolean)
  })
  return names.length ? `- ${from} → ${to} ${names.map((n) => `[[${n}]]`).join(' ')}` : null
}

const isDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toISOString().slice(0, 10) === d
}

/** What the Declare context modal takes: two dates with anything between them, or one date for a single day. */
export function parseInterval(text: string): { from: string; to: string } | null {
  const dates = text.match(new RegExp(DATE, 'g')) ?? []
  const [from, to = from] = dates
  if (!from || !to || dates.length > 2 || !isDate(from) || !isDate(to) || to < from) return null
  return { from, to }
}
