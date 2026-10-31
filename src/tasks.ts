import { type App, DropdownComponent, Events, ItemView, MarkdownRenderChild, TFile, type WorkspaceLeaf } from 'obsidian'
import { type Change, orgAction } from './actions'
import { type Vocabulary, vocabulary } from './complete'
import { t } from './i18n'
import {
  type Place,
  type PlaceSettings,
  type TaskDate,
  ended,
  indexedDates,
  offRule,
  openUndated,
  placeOf,
  showsEntry,
  tasksIn,
} from './ladder'
import { ALL, type ListFilter, type ListedTask, filterOptions, filterTasks } from './list'
import { STATES } from './org'

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
  private undated = new Map<string, { home: Place; count: number }>()
  /** tags and categories of every note, on the ladder or not, for the autocomplete */
  private words = new Map<string, Vocabulary>()
  /** every task of every note, once each, for the list view */
  private tasks = new Map<string, ListedTask[]>()

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
    if (this.undated.delete(path) || dated || listed) this.trigger('changed')
  }

  /** The files holding pending tasks on `today`, and how many blocks each would migrate. */
  pending(today: string): { path: string; count: number }[] {
    return [...this.undated].flatMap(([path, { home, count }]) => (ended(home, today) ? [{ path, count }] : []))
  }

  /** The tags and categories already used in the vault, each once. */
  vocabulary(): Vocabulary {
    const all = [...this.words.values()]
    return {
      tags: [...new Set(all.flatMap((w) => w.tags))],
      categories: [...new Set(all.flatMap((w) => w.categories))],
    }
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
    const lines = data.split('\n')
    this.words.set(file.path, vocabulary(lines))
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
    const count = home.kind === 'list' ? 0 : openUndated(lines).length
    if (count) this.undated.set(file.path, { home, count })
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

const PLACES = ['list', 'year', 'month', 'week', 'day'] as const

/** Every task of the vault, filtered by state, priority, place, about, tag and category; live with the index. */
export class TaskListView extends ItemView {
  /** kept across renders, so a click on a state, which rewrites the file, does not reset the filters */
  private filter: ListFilter = { ...ALL, state: 'open' }
  /** the abouts, tags and categories the filter bar was built with: any edit fires 'changed', and rebuilding the bar
   * each time would close a dropdown open under the user */
  private options = ''
  private bar: HTMLElement
  private list: HTMLElement

  constructor(
    leaf: WorkspaceLeaf,
    private index: TaskIndex,
  ) {
    super(leaf)
    this.bar = this.contentEl.createDiv({ cls: 'tide-filters' })
    this.list = this.contentEl.createDiv()
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
    const select = <K extends keyof ListFilter>(key: K, options: [string, string][]) => {
      const field = this.bar.createEl('label', { cls: 'tide-filter', text: t(`filter.${key}`) })
      const value = this.filter[key]
      // a value gone from the vault, such as a tag just removed, still shows as chosen
      if (value && !options.some(([v]) => v === value)) options.push([value, value])
      new DropdownComponent(field)
        .addOptions(Object.fromEntries(options))
        .setValue(value)
        .onChange((value) => {
          this.filter[key] = value as ListFilter[K]
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

export function fileAt(app: App, path: string): TFile | null {
  const file = app.vault.getAbstractFileByPath(path)
  return file instanceof TFile ? file : null
}

/** The state, which advances on a click, the priority and the title, which opens the source. */
function taskRow(ul: HTMLElement, app: App, task: ListedTask): HTMLElement {
  const { state, priority, title } = task.block
  const li = ul.createEl('li', { cls: 'tide-task' })
  const button = li.createEl('button', {
    cls: `tide-state tide-state-${state!.toLowerCase()}`,
    text: state!,
    attr: { 'aria-label': t('command.nextState') },
  })
  button.addEventListener('click', () => void advance(app, task))
  if (priority) li.createSpan({ cls: 'tide-priority', text: `[#${priority}]` })
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

type TaskAt = Pick<ListedTask, 'path' | 'line' | 'head'>

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
    // the file may have changed since indexing: write only to a head we can still find for sure
    const hits = lines.flatMap((l, i) => (l === task.head ? [i] : []))
    const at = lines[task.line] === task.head ? task.line : hits.length === 1 ? hits[0] : -1
    const changes = at < 0 ? null : orgAction(lines, at, 'nextState', new Date())
    return changes ? applyChanges(data, changes) : data
  })
}

function applyChanges(doc: string, changes: Change[]): string {
  return [...changes]
    .sort((a, b) => b.from - a.from)
    .reduce((d, c) => d.slice(0, c.from) + c.insert + d.slice(c.to), doc)
}
