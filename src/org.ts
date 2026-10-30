export const STATES = ["TODO", "DOING", "DONE", "CANCELED"] as const;
export type State = (typeof STATES)[number];
export type Priority = "A" | "B" | "C";

export interface Timestamp {
  date: string;
  weekday: string | null;
  time: string | null;
  repeater: string | null;
}

export interface Step {
  checked: boolean;
  text: string;
}

export interface OrgBlock {
  /** task has a keyword; event is a keywordless line with SCHEDULED; note is anything else */
  kind: "task" | "event" | "note";
  indent: string;
  childIndent: string;
  state: State | null;
  priority: Priority | null;
  title: string;
  /** whitespace between title and tags, kept so tag alignment survives a round trip */
  tagsGap: string;
  tags: string[];
  scheduled: Timestamp | null;
  deadline: Timestamp | null;
  closed: Timestamp | null;
  properties: [string, string][] | null;
  /** raw lines between :LOGBOOK: and :END: */
  logbook: string[] | null;
  /** raw description and step lines */
  body: string[];
  steps: Step[];
}

const HEAD = /^(\s*)- (?!\[[ xX-]\] )(?:(TODO|DOING|DONE|CANCELED)(?: |$))?(?:\[#([ABC])\](?: |$))?(.*)$/;
const TAGS = /^(.*?)(\s+):((?:[^\s:]+:)+)$/;
const PLANNING = /^\s*(SCHEDULED|DEADLINE|CLOSED): ([<[])(\d{4}-\d{2}-\d{2})(?: ([^\s\d>\]+]+))?(?: (\d{1,2}:\d{2}))?(?: (\+\d+[dwmy]))?([>\]])$/;
const PROPERTY = /^\s*:([^\s:]+):(?: (.*))?$/;
const STEP = /^\s*- \[([ xX])\] (.*)$/;

/** Head line of a list item that can carry a task (checkbox steps can't). */
export function parseHead(line: string) {
  const m = HEAD.exec(line);
  if (!m) return null;
  const [, indent, state, priority, rest] = m;
  const t = TAGS.exec(rest);
  return {
    indent,
    state: (state as State) ?? null,
    priority: (priority as Priority) ?? null,
    title: t ? t[1] : rest,
    tagsGap: t ? t[2] : "",
    tags: t ? t[3].slice(0, -1).split(":") : [],
  };
}

export function parseBlock(lines: string[]): OrgBlock | null {
  const head = parseHead(lines[0]);
  if (!head) return null;
  const rest = lines.slice(1);
  const childIndent = rest.find((l) => l.trim())?.match(/^\s*/)![0] ?? head.indent + "  ";

  const planning: Partial<Record<"SCHEDULED" | "DEADLINE" | "CLOSED", Timestamp>> = {};
  let i = 0;
  for (; i < rest.length; i++) {
    const m = PLANNING.exec(rest[i]);
    // brackets must match the keyword: CLOSED is inactive [..], the others active <..>
    if (!m || (m[1] === "CLOSED") !== (m[2] === "[") || planning[m[1] as "CLOSED"]) break;
    if ((m[2] === "[") !== (m[7] === "]")) break;
    planning[m[1] as "CLOSED"] = { date: m[3], weekday: m[4] ?? null, time: m[5] ?? null, repeater: m[6] ?? null };
  }

  let properties: [string, string][] | null = null;
  let logbook: string[] | null = null;
  for (;;) {
    const name = rest[i]?.trim();
    const end = rest.findIndex((l, j) => j > i && l.trim() === ":END:");
    if (end < 0) break;
    if (name === ":PROPERTIES:" && !properties) {
      const props = rest.slice(i + 1, end).map((l) => PROPERTY.exec(l));
      if (props.some((p) => !p)) break;
      properties = props.map((p) => [p![1], p![2] ?? ""]);
    } else if (name === ":LOGBOOK:" && !logbook) {
      logbook = rest.slice(i + 1, end);
    } else break;
    i = end + 1;
  }

  const body = rest.slice(i);
  const scheduled = planning.SCHEDULED ?? null;
  return {
    ...head,
    kind: head.state ? "task" : scheduled ? "event" : "note",
    childIndent,
    scheduled,
    deadline: planning.DEADLINE ?? null,
    closed: planning.CLOSED ?? null,
    properties,
    logbook,
    body,
    steps: body.flatMap((l) => {
      const m = STEP.exec(l);
      return m ? [{ checked: m[1] !== " ", text: m[2] }] : [];
    }),
  };
}

export function formatTimestamp(t: Timestamp, active: boolean): string {
  const inner = [t.date, t.weekday, t.time, t.repeater].filter(Boolean).join(" ");
  return active ? `<${inner}>` : `[${inner}]`;
}

export function serializeBlock(b: OrgBlock): string[] {
  const c = b.childIndent;
  const title = [b.state, b.priority && `[#${b.priority}]`, b.title].filter(Boolean).join(" ");
  const out = [b.indent + "- " + title + (b.tags.length ? `${b.tagsGap || " "}:${b.tags.join(":")}:` : "")];
  if (b.scheduled) out.push(`${c}SCHEDULED: ${formatTimestamp(b.scheduled, true)}`);
  if (b.deadline) out.push(`${c}DEADLINE: ${formatTimestamp(b.deadline, true)}`);
  if (b.closed) out.push(`${c}CLOSED: ${formatTimestamp(b.closed, false)}`);
  if (b.properties) {
    out.push(`${c}:PROPERTIES:`, ...b.properties.map(([k, v]) => `${c}:${k}:${v ? " " + v : ""}`), `${c}:END:`);
  }
  if (b.logbook) out.push(`${c}:LOGBOOK:`, ...b.logbook, `${c}:END:`);
  return out.concat(b.body);
}
