import {
  type App,
  DropdownComponent,
  Events,
  ItemView,
  MarkdownRenderChild,
  TFile,
  type WorkspaceLeaf,
  moment,
  setIcon,
} from 'obsidian'
import { type Change, orgAction } from './actions'
import { type AgendaEntry, agenda, daysLate, onDate } from './agenda'
import { looseIn, monthWeeks, shiftMonth } from './calendar'
import { type Vocabulary, vocabulary } from './complete'
import { type Declaration, declarationsIn } from './contexts'
import { type MessageKey, t } from './i18n'
import {
  type Place,
  type PlaceSettings,
  type TaskDate,
  ended,
  eventsIn,
  indexedDates,
  isoWeek,
  offRule,
  openUndated,
  placeOf,
  showsEntry,
  tasksIn,
} from './ladder'
import { ALL, type ListFilter, type ListedTask, filterOptions, filterTasks } from './list'
import { STATES, weekday } from './org'

/** One task on one of its days: a task with SCHEDULED and DEADLINE on different days is indexed twice. */
export interface IndexedTask extends TaskDate, ListedTask {
  home: Place
  /** off the rule on this date: shows on this day only, where its date says, until fixed */
  off: boolean
}

/** Every dated task of the vault that can show below where it lives. Fires 'changed' after each update. */
export class TaskIndex extends Events {
  private files = new Map<string, IndexedTask[]>()
  /** files of a day, week, month or year with open undated tasks, which are pending once their period is over */
  private undated = new Map<string, { home: Place; heads: number[] }>()
  /** tags and categories of every note, on the ladder or not, for the autocomplete */
  private words = new Map<string, Vocabulary>()
  /** every task of every note, once each, for the list view */
  private tasks = new Map<string, ListedTask[]>()
  /** the events on the ladder, for the agenda: they never count as work */
  private eventsOf = new Map<string, ListedTask[]>()
  /** the declaration lines of every note; only a context's count, decided by the marker when read */
  private declarationsOf = new Map<string, Declaration[]>()

  constructor(
    private app: App,
    private settings: () => PlaceSettings,
  ) {
    super()
  }

  async rebuild() {
    this.files.clear()
    this.words.clear()
    this.tasks.clear()
    this.eventsOf.clear()
    this.declarationsOf.clear()
    for (const file of this.app.vault.getMarkdownFiles()) {
      // a file deleted mid-scan must not stop the rest of the vault from being indexed
      const data = await this.app.vault.cachedRead(file).catch(() => null)
      if (data !== null) this.read(file, data)
    }
    this.trigger('changed')
  }

  update(file: TFile, data: string) {
    this.read(file, data)
    this.trigger('changed')
  }

  remove(path: string) {
    this.words.delete(path)
    const listed = this.tasks.delete(path)
    const dated = this.files.delete(path)
    const events = this.eventsOf.delete(path)
    const declared = this.declarationsOf.delete(path)
    if (this.undated.delete(path) || dated || listed || events || declared) this.trigger('changed')
  }

  /** The files holding pending tasks on `today`, and how many blocks each would migrate. */
  pending(today: string): { path: string; count: number }[] {
    return [...this.undated].flatMap(([path, { home, heads }]) =>
      ended(home, today) ? [{ path, count: heads.length }] : [],
    )
  }

  /** The pending tasks on `today`, the very blocks Migrate pending to today moves. */
  pendingTasks(today: string): ListedTask[] {
    return this.pending(today).flatMap(({ path }) => {
      const heads = this.undated.get(path)!.heads
      return (this.tasks.get(path) ?? []).filter((t) => heads.includes(t.line))
    })
  }

  /** Every event on the ladder. */
  events(): ListedTask[] {
    return [...this.eventsOf.values()].flat()
  }

  /** The tags and categories already used in the vault, each once. */
  vocabulary(): Vocabulary {
    const all = [...this.words.values()]
    return {
      tags: [...new Set(all.flatMap((w) => w.tags))],
      categories: [...new Set(all.flatMap((w) => w.categories))],
    }
  }

  /** The declaration lines of the note at `path`. */
  declarations(path: string): Declaration[] {
    return this.declarationsOf.get(path) ?? []
  }

  /** Every task of the vault, once each. */
  all(): ListedTask[] {
    return [...this.tasks.values()].flat()
  }

  at(here: Place): IndexedTask[] {
    return [...this.files.values()]
      .flat()
      .filter((task) => showsEntry(task, here))
      .sort((a, b) => a.date.localeCompare(b.date) || a.path.localeCompare(b.path) || a.line - b.line)
  }

  private read(file: TFile, data: string) {
    this.files.delete(file.path)
    this.undated.delete(file.path)
    this.eventsOf.delete(file.path)
    const lines = data.split('\n')
    this.words.set(file.path, vocabulary(lines))
    const declarations = declarationsIn(lines)
    if (declarations.length) this.declarationsOf.set(file.path, declarations)
    else this.declarationsOf.delete(file.path)
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? null
    const home = placeOf(file.path, frontmatter, this.settings())
    const found = tasksIn(lines)
    if (found.length)
      this.tasks.set(
        file.path,
        found.map(({ line, block }) => ({ path: file.path, line, head: lines[line], block, home })),
      )
    else this.tasks.delete(file.path)
    if (!home) return
    const heads = home.kind === 'list' ? [] : openUndated(lines)
    if (heads.length) this.undated.set(file.path, { home, heads })
    const events = eventsIn(lines).map(({ line, block }) => ({ path: file.path, line, head: lines[line], block, home }))
    if (events.length) this.eventsOf.set(file.path, events)
    const tasks = found.flatMap(({ line, block }) =>
      indexedDates(block, home).map((d) => ({ ...d, path: file.path, line, head: lines[line], block, home })),
    )
    if (tasks.length) this.files.set(file.path, tasks)
  }
}

/** The ```tide-tasks``` block: what falls in this file's period, live. Empty when nothing does. */
export class TasksBlock extends MarkdownRenderChild {
  constructor(
    el: HTMLElement,
    private app: App,
    private index: TaskIndex,
    /** read on each render, so a change in the settings reaches open blocks */
    private place: () => Place | null,
    private today: () => string,
    /** runs Migrate pending to today, from the notice in today's daily */
    private migrate: () => void,
  ) {
    super(el)
  }

  onload() {
    this.registerEvent(this.index.on('changed', () => this.render()))
    this.render()
  }

  private render() {
    this.containerEl.empty()
    const here = this.place()
    if (here?.kind === 'day' && here.key === this.today()) this.renderPending(here.key)
    const tasks = here ? this.index.at(here) : []
    if (!tasks.length) return
    const ul = this.containerEl.createEl('ul', { cls: 'tide-tasks' })
    for (const task of tasks) {
      const li = taskRow(ul, this.app, task)
      if (task.kind === 'deadline') li.createSpan({ cls: 'tide-deadline', text: t('block.deadline') })
      if (here!.kind !== 'day') li.createSpan({ cls: 'tide-date', text: task.date })
      li.createSpan({ cls: 'tide-source', text: task.path.replace(/\.md$/, '') })
    }
  }

  /** "N pendentes · migrar" in today's daily, gone when nothing is pending. */
  private renderPending(today: string) {
    const count = this.index.pending(today).reduce((n, f) => n + f.count, 0)
    if (!count) return
    const div = this.containerEl.createDiv({
      cls: 'tide-pending',
      text: `${count} ${t(count === 1 ? 'pending.one' : 'pending.many')} · `,
    })
    const button = div.createEl('button', { text: t('pending.migrate'), attr: { 'aria-label': t('command.migrate') } })
    button.addEventListener('click', () => this.migrate())
  }
}

export const LIST_VIEW = 'tide-list'

/** the filter a list opens with, and what "clear filters" goes back to */
const START: ListFilter = { ...ALL, state: 'open' }

const PLACES = ['list', 'year', 'month', 'week', 'day'] as const

/** Every task of the vault, filtered by state, priority, place, about, tag and category; live with the index. */
export class TaskListView extends ItemView {
  /** kept across renders, so a click on a state, which rewrites the file, does not reset the filters */
  private filter: ListFilter = { ...START }
  /** the abouts, tags and categories the filter bar was built with: any edit fires 'changed', and rebuilding the bar
   * each time would close a dropdown open under the user */
  private options = ''
  private search: HTMLInputElement
  private bar: HTMLElement
  private list: HTMLElement

  constructor(
    leaf: WorkspaceLeaf,
    private index: TaskIndex,
  ) {
    super(leaf)
    this.search = this.contentEl.createEl('input', {
      type: 'search',
      cls: 'tide-search',
      placeholder: t('list.search'),
    })
    this.search.addEventListener('input', () => {
      this.filter.q = this.search.value
      this.render()
    })
    this.bar = this.contentEl.createDiv({ cls: 'tide-filters' })
    this.list = this.contentEl.createDiv({ cls: 'tide-list' })
  }

  getViewType() {
    return LIST_VIEW
  }

  getDisplayText() {
    return t('list.title')
  }

  getIcon() {
    return 'list-checks'
  }

  async onOpen() {
    this.registerEvent(this.index.on('changed', () => this.render()))
    this.render()
  }

  private render() {
    const tasks = this.index.all()
    const options = filterOptions(tasks)
    const key = JSON.stringify(options)
    if (key !== this.options) {
      this.options = key
      this.renderFilters(options)
    }
    this.list.empty()
    const shown = filterTasks(tasks, this.filter)
    const count = this.list.createDiv({ cls: 'tide-count' })
    count.createSpan({ text: `${shown.length} de ${tasks.length} ${t('list.count')}` })
    if (JSON.stringify(this.filter) !== JSON.stringify(START)) {
      const clear = count.createEl('a', { cls: 'tide-clear', text: t('list.clear'), href: '#' })
      clear.addEventListener('click', (e) => {
        e.preventDefault()
        this.filter = { ...START }
        this.search.value = ''
        // the dropdowns keep their old value until the bar is built again
        this.options = ''
        this.render()
      })
    }
    if (!shown.length) {
      this.list.createDiv({ cls: 'tide-empty', text: t('list.empty') })
      return
    }
    const ul = this.list.createEl('ul', { cls: 'tide-tasks' })
    for (const task of shown)
      taskRow(ul, this.app, task).createSpan({ cls: 'tide-source', text: task.path.replace(/\.md$/, '') })
  }

  private renderFilters({ abouts, tags, categories }: ReturnType<typeof filterOptions>) {
    this.bar.empty()
    const any: [string, string] = ['', t('filter.any')]
    const none: [string, string] = ['-', t('filter.none')]
    const select = <K extends Exclude<keyof ListFilter, 'q'>>(key: K, options: [string, string][]) => {
      const field = this.bar.createEl('label', { cls: 'tide-filter', text: t(`filter.${key}`) })
      const value = this.filter[key]
      // a value gone from the vault, such as a tag just removed, still shows as chosen
      if (value && !options.some(([v]) => v === value)) options.push([value, value])
      // a filter off its default reads as set, in the accent color
      const mark = (v: string) => field.toggleClass('tide-filter-set', !!v && !(key === 'state' && v === 'open'))
      mark(value)
      new DropdownComponent(field)
        .addOptions(Object.fromEntries(options))
        .setValue(value)
        .onChange((value) => {
          this.filter[key] = value as ListFilter[K]
          mark(value)
          this.render()
        })
    }
    select('state', [
      ['open', t('filter.open')],
      ['all', t('filter.any')],
      ...STATES.map((s): [string, string] => [s, s]),
    ])
    select('priority', [any, ...(['A', 'B', 'C'] as const).map((p): [string, string] => [p, `[#${p}]`]), none])
    select('place', [any, ...PLACES.map((p): [string, string] => [p, t(`place.${p}`)]), none])
    select('about', [any, ...abouts.map((about): [string, string] => [about, about])])
    select('tag', [any, ...tags.map((tag): [string, string] => [tag, `:${tag}:`])])
    select('category', [any, ...categories.map((category): [string, string] => [category, category]), none])
  }
}

export const AGENDA_VIEW = 'tide-agenda'

/** Like the org agenda: the overdue in red, the pending, then today and the next 6 days; live with the index. */
export class AgendaView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private index: TaskIndex,
    private today: () => string,
    /** opens the daily, week, month or year, created when missing; not `open`, which would shadow View.open and skip onOpen */
    private openPlace: (place: Place) => void,
    /** Move to… on a task or event */
    private move: (task: TaskAt) => void,
  ) {
    super(leaf)
  }

  getViewType() {
    return AGENDA_VIEW
  }

  getDisplayText() {
    return t('agenda.title')
  }

  getIcon() {
    return 'calendar-clock'
  }

  async onOpen() {
    this.registerEvent(this.index.on('changed', () => this.render()))
    this.render()
  }

  private render() {
    this.contentEl.empty()
    const today = this.today()
    const { overdue, pending, days } = agenda(
      [...this.index.all(), ...this.index.events()],
      this.index.pendingTasks(today),
      today,
    )
    if (overdue.length) {
      const group = this.group('agenda.overdue', 'tide-agenda-overdue')
      for (const entry of overdue) this.row(group, entry, today)
    }
    if (pending.length) {
      const group = this.group('agenda.pending', 'tide-agenda-pending')
      for (const task of pending) this.row(group, { task }, today)
    }
    for (const [i, { date, entries }] of days.entries()) {
      const cls = `tide-aday${entries.length ? '' : ' tide-aday-empty'}${date === today ? ' tide-aday-today' : ''}`
      const group = this.contentEl.createDiv({ cls })
      const heading = group.createDiv({ cls: 'tide-ahead' })
      placeLink(this.openPlace, heading, dayLabel(date, i), { kind: 'day', key: date })
      // the week and month of the first day, then each new one's
      const prev = days[i - 1]?.date
      const week = isoWeek(date).week
      if (!prev || week !== isoWeek(prev).week) placeLink(this.openPlace, heading, week, { kind: 'week', key: week })
      const month = date.slice(0, 7)
      if (!prev || month !== prev.slice(0, 7)) placeLink(this.openPlace, heading, month, { kind: 'month', key: month })
      for (const entry of entries) this.row(group, entry, today)
    }
  }

  private group(title: MessageKey, cls: string): HTMLElement {
    const group = this.contentEl.createDiv({ cls: `tide-aday ${cls}` })
    group.createDiv({ cls: 'tide-ahead', text: t(title) })
    return group
  }

  /** One line, as in the org agenda: time, what makes it be there, state and priority, title, tags, Move to…. */
  private row(
    parent: HTMLElement,
    { task, kind, time, date }: Pick<AgendaEntry, 'task'> & Partial<AgendaEntry>,
    today: string,
  ) {
    const { state, priority, title, tags } = task.block
    const closed = state === 'DONE' || state === 'CANCELED'
    const row = parent.createDiv({ cls: `tide-arow${closed ? ' tide-closed' : ''}` })
    row.createSpan({ cls: 'tide-atime', text: time ?? '' })
    // the plain case says nothing: a deadline, a repeat, how late or done is what is worth a mark
    const late = date && date < today ? `${daysLate(date, today)}d` : ''
    const mark = [late, kind === 'deadline' ? (late ? '⚑' : `⚑ ${t('block.deadline')}`) : ''].filter(Boolean).join(' ')
    const repeats = task.block.scheduled?.repeater ? '↻' : ''
    row.createSpan({ cls: 'tide-amark', text: mark || repeats || (closed ? '✓' : '') })
    const kw = row.createSpan({ cls: 'tide-ahead-kw' })
    if (state) {
      const button = kw.createEl('button', {
        cls: `tide-state tide-state-${state.toLowerCase()}`,
        text: state,
        attr: { 'aria-label': t('command.nextState') },
      })
      button.addEventListener('click', () => void advance(this.app, task))
    }
    if (priority) kw.createSpan({ cls: `tide-priority tide-priority-${priority}`, text: `[#${priority}]` })
    const link = row.createEl('a', { cls: 'tide-title', text: title, href: '#' })
    link.setAttr('title', task.path.replace(/\.md$/, ''))
    link.addEventListener('click', (e) => {
      e.preventDefault()
      void openAt(this.app, task)
    })
    row.createSpan({ cls: 'tide-tags-text', text: tags.length ? `:${tags.join(':')}:` : '' })
    const move = row.createEl('button', {
      cls: 'clickable-icon tide-move',
      attr: { 'aria-label': t('command.moveTo') },
    })
    setIcon(move, 'forward')
    move.addEventListener('click', () => this.move(task))
  }
}

/** "Hoje · Sáb 31/10", "Amanhã · Dom 01/11", then "Segunda 02/11": the day as the org agenda heads it. */
function dayLabel(date: string, i: number): string {
  const day = moment(date, 'YYYY-MM-DD').locale('pt-br')
  const rest = day.format(i < 2 ? 'ddd D/MM' : 'dddd D/MM').replace('.', '')
  const text = rest.charAt(0).toUpperCase() + rest.slice(1)
  return i === 0 ? `${t('agenda.todayLabel')} · ${text}` : i === 1 ? `${t('agenda.tomorrow')} · ${text}` : text
}

/** A link that opens the note of a place. */
function placeLink(open: (place: Place) => void, el: HTMLElement, text: string, place: Place): HTMLElement {
  const a = el.createEl('a', { text, href: '#' })
  a.addEventListener('click', (e) => {
    e.preventDefault()
    open(place)
  })
  return a
}

export function fileAt(app: App, path: string): TFile | null {
  const file = app.vault.getAbstractFileByPath(path)
  return file instanceof TFile ? file : null
}

/** The state, which advances on a click, the priority and the title, which opens the source. An event has no state. */
function taskRow(ul: HTMLElement, app: App, task: ListedTask): HTMLElement {
  const { state, priority, title } = task.block
  const li = ul.createEl('li', { cls: 'tide-task' })
  if (state) {
    const button = li.createEl('button', {
      cls: `tide-state tide-state-${state.toLowerCase()}`,
      text: state,
      attr: { 'aria-label': t('command.nextState') },
    })
    button.addEventListener('click', () => void advance(app, task))
  }
  if (priority) li.createSpan({ cls: `tide-priority tide-priority-${priority}`, text: `[#${priority}]` })
  const link = li.createEl('a', { cls: 'tide-title', text: title, href: '#' })
  // the same mark as in the editor, on every row of a task off the rule, not only the one shown off its place
  const why = offRule(task.block, task.home)
  if (why) {
    link.addClass('tide-off-rule')
    link.setAttr('title', t(`offRule.${why}`))
  }
  link.addEventListener('click', (e) => {
    e.preventDefault()
    void openAt(app, task)
  })
  return li
}

export type TaskAt = Pick<ListedTask, 'path' | 'line' | 'head'>

/**
 * The head line of the task in `lines`, which may have changed since indexing: the same line, else the only line
 * equal to the head, else -1 so nothing is written.
 */
export function headAt(lines: string[], task: TaskAt): number {
  if (lines[task.line] === task.head) return task.line
  const hits = lines.flatMap((l, i) => (l === task.head ? [i] : []))
  return hits.length === 1 ? hits[0] : -1
}

async function openAt(app: App, task: TaskAt) {
  const file = fileAt(app, task.path)
  if (file) await app.workspace.getLeaf(false).openFile(file, { eState: { line: task.line } })
}

/** Advances the state in the source file, with the same rules as Shift+→ there. */
async function advance(app: App, task: TaskAt) {
  const file = fileAt(app, task.path)
  if (!file) return
  await app.vault.process(file, (data) => {
    const lines = data.split('\n')
    const at = headAt(lines, task)
    const changes = at < 0 ? null : orgAction(lines, at, 'nextState', new Date())
    return changes ? applyChanges(data, changes) : data
  })
}

function applyChanges(doc: string, changes: Change[]): string {
  return [...changes]
    .sort((a, b) => b.from - a.from)
    .reduce((d, c) => d.slice(0, c.from) + c.insert + d.slice(c.to), doc)
}

export const CALENDAR_VIEW = 'tide-calendar'

/** The month as a grid of ISO weeks, Monday first: a day opens its daily, a week number opens its week note. */
export class CalendarView extends ItemView {
  private month: string

  constructor(
    leaf: WorkspaceLeaf,
    private index: TaskIndex,
    private today: () => string,
    /** opens the daily, week or month, created when missing */
    private openPlace: (place: Place) => void,
  ) {
    super(leaf)
    this.month = today().slice(0, 7)
  }

  getViewType() {
    return CALENDAR_VIEW
  }

  getDisplayText() {
    return t('calendar.title')
  }

  getIcon() {
    return 'calendar'
  }

  async onOpen() {
    // the index fires 'changed' on a new day too, which moves the mark on today
    this.registerEvent(this.index.on('changed', () => this.render()))
    this.render()
  }

  private go(month: string) {
    this.month = month
    this.render()
  }

  private render() {
    this.contentEl.empty()
    const today = this.today()
    const nav = this.contentEl.createDiv({ cls: 'tide-calendar-nav' })
    this.button(nav, 'chevron-left', 'calendar.prev', () => this.go(shiftMonth(this.month, -1)))
    const name = moment(this.month, 'YYYY-MM').locale('pt-br').format('MMMM YYYY')
    placeLink(this.openPlace, nav, name.charAt(0).toUpperCase() + name.slice(1), { kind: 'month', key: this.month })
    this.button(nav, 'chevron-right', 'calendar.next', () => this.go(shiftMonth(this.month, 1)))
    nav.createEl('button', { text: t('calendar.today') }).addEventListener('click', () => this.go(today.slice(0, 7)))

    const grid = this.contentEl.createDiv({ cls: 'tide-calendar' })
    const items = [...this.index.all(), ...this.index.events()]
    const weeks = monthWeeks(this.month)
    grid.createDiv()
    for (const day of weeks[0].days) grid.createDiv({ cls: 'tide-calendar-weekday', text: weekday(day) })
    for (const { week, days } of weeks) {
      placeLink(this.openPlace, grid, week.slice(6), { kind: 'week', key: week }).addClass('tide-calendar-week')
      for (const day of days) {
        const cell = grid.createDiv({ cls: 'tide-calendar-day' })
        if (!day.startsWith(this.month)) cell.addClass('tide-calendar-other')
        if (day === today) cell.addClass('tide-calendar-today')
        placeLink(this.openPlace, cell, String(Number(day.slice(8))), { kind: 'day', key: day })
        for (const { task, kind, time } of onDate(items, day)) this.chip(cell, task, kind, time)
      }
    }
    this.loose(this.index.all())
  }

  /** The month's open tasks that belong to it but to no day. */
  private loose(items: ListedTask[]) {
    const tasks = looseIn(items, this.month)
    if (!tasks.length) return
    this.contentEl.createDiv({ cls: 'tide-agenda-section', text: `${this.month} · ${t('calendar.loose')}` })
    const ul = this.contentEl.createEl('ul', { cls: 'tide-tasks' })
    for (const task of tasks)
      taskRow(ul, this.app, task).createSpan({ cls: 'tide-source', text: task.path.replace(/\.md$/, '') })
  }

  /** A task on its day: the time and the title on one line, a flag on a deadline, its state in the color. */
  private chip(cell: HTMLElement, task: ListedTask, kind: AgendaEntry['kind'], time: string | null) {
    const { state, title, scheduled } = task.block
    const repeats = kind === 'scheduled' && scheduled?.repeater
    const chip = cell.createDiv({
      cls: `tide-chip tide-chip-${state?.toLowerCase() ?? 'event'}${repeats ? ' tide-chip-repeat' : ''}`,
    })
    const mark = kind === 'deadline' ? '⚑ ' : repeats ? '↻ ' : state === 'DONE' ? '✓ ' : ''
    chip.setText(`${time ? time + ' ' : ''}${mark}${title}`)
    chip.setAttr('title', `${state ?? ''} ${task.path.replace(/\.md$/, '')}`.trim())
    chip.addEventListener('click', () => void openAt(this.app, task))
  }

  private button(el: HTMLElement, icon: string, label: MessageKey, click: () => void) {
    const button = el.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': t(label) } })
    setIcon(button, icon)
    button.addEventListener('click', click)
  }
}

export const TASKS_VIEW = 'tide-tasks-view'

const TABS = ['list', 'calendar', 'agenda'] as const
export type TasksTab = (typeof TABS)[number]

/** One panel with the list, the calendar and the agenda as tabs; each tab is the view it was, its content moved in. */
export class TasksView extends ItemView {
  private tab: TasksTab = 'list'
  private buttons = {} as Record<TasksTab, HTMLElement>

  constructor(
    leaf: WorkspaceLeaf,
    private tabs: Record<TasksTab, TaskListView | CalendarView | AgendaView>,
  ) {
    super(leaf)
    this.contentEl.addClass('tide-panel')
    const bar = this.contentEl.createDiv({ cls: 'tide-tabs' })
    for (const tab of TABS) {
      this.buttons[tab] = bar.createEl('button', { text: t(`${tab}.title`) })
      this.buttons[tab].addEventListener('click', () => this.show(tab))
    }
    for (const view of Object.values(tabs)) {
      this.addChild(view)
      this.contentEl.appendChild(view.contentEl)
    }
  }

  getViewType() {
    return TASKS_VIEW
  }

  getDisplayText() {
    return t('tasks.title')
  }

  getIcon() {
    return 'check-square'
  }

  async onOpen() {
    for (const view of Object.values(this.tabs)) await view.onOpen()
    this.show(this.tab)
  }

  show(tab: TasksTab) {
    this.tab = tab
    for (const k of TABS) {
      this.tabs[k].contentEl.toggle(k === tab)
      this.buttons[k].toggleClass('is-active', k === tab)
    }
  }
}
