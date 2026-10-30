import { type App, Events, MarkdownRenderChild, TFile } from 'obsidian'
import { type Change, orgAction } from './actions'
import { t } from './i18n'
import { type Place, type PlaceSettings, placeOf, showsAt, tasksIn } from './ladder'
import type { OrgBlock } from './org'

export interface IndexedTask {
  path: string
  line: number
  /** the head line as indexed, to find the task again before writing */
  head: string
  block: OrgBlock
  home: Place
  date: string
}

/** Every dated task of the vault that can show below where it lives. Fires 'changed' after each update. */
export class TaskIndex extends Events {
  private files = new Map<string, IndexedTask[]>()

  constructor(
    private app: App,
    private settings: () => PlaceSettings,
  ) {
    super()
  }

  async rebuild() {
    this.files.clear()
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
    if (this.files.delete(path)) this.trigger('changed')
  }

  at(here: Place): IndexedTask[] {
    return [...this.files.values()]
      .flat()
      .filter((task) => showsAt(task.home, task.date, here))
      .sort((a, b) => a.date.localeCompare(b.date) || a.path.localeCompare(b.path) || a.line - b.line)
  }

  private read(file: TFile, data: string) {
    this.files.delete(file.path)
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? null
    const home = placeOf(file.path, frontmatter, this.settings())
    // nothing sits below a day, so day files never feed a block
    if (!home || home.kind === 'day') return
    const lines = data.split('\n')
    const tasks = tasksIn(lines).flatMap(({ line, block }) => {
      const date = block.scheduled?.date ?? block.deadline?.date
      return date ? [{ path: file.path, line, head: lines[line], block, home, date }] : []
    })
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
    const tasks = here ? this.index.at(here) : []
    if (!tasks.length) return
    const ul = this.containerEl.createEl('ul', { cls: 'tide-tasks' })
    for (const task of tasks) {
      const { state, priority, title } = task.block
      const li = ul.createEl('li', { cls: 'tide-task' })
      const button = li.createEl('button', {
        cls: `tide-state tide-state-${state!.toLowerCase()}`,
        text: state!,
        attr: { 'aria-label': t('command.nextState') },
      })
      button.addEventListener('click', () => void advance(this.app, task))
      if (priority) li.createSpan({ cls: 'tide-priority', text: `[#${priority}]` })
      const link = li.createEl('a', { cls: 'tide-title', text: title, href: '#' })
      link.addEventListener('click', (e) => {
        e.preventDefault()
        void openAt(this.app, task)
      })
      if (here!.kind !== 'day') li.createSpan({ cls: 'tide-date', text: task.date })
      li.createSpan({ cls: 'tide-source', text: task.path.replace(/\.md$/, '') })
    }
  }
}

function fileAt(app: App, path: string): TFile | null {
  const file = app.vault.getAbstractFileByPath(path)
  return file instanceof TFile ? file : null
}

async function openAt(app: App, task: IndexedTask) {
  const file = fileAt(app, task.path)
  if (file) await app.workspace.getLeaf(false).openFile(file, { eState: { line: task.line } })
}

/** Advances the state in the source file, with the same rules as Shift+→ there. */
async function advance(app: App, task: IndexedTask) {
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
