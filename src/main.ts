import { type Extension, Prec, RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate, keymap } from '@codemirror/view'
import {
  type App,
  type Editor,
  type EditorPosition,
  EditorSuggest,
  FuzzySuggestModal,
  Plugin,
  TFile,
  debounce,
  editorInfoField,
  moment,
  normalizePath,
} from 'obsidian'
import { type Action, type Change, diffLines, findBlock, orgAction } from './actions'
import { foldTasks, tideEditor } from './editor'
import { type SuggestContext, type Suggestion, type Suggestions, orgSuggest } from './complete'
import { type MessageKey, t } from './i18n'
import {
  type OffRule,
  type Place,
  type PlaceSettings,
  firstDay,
  holds,
  isoWeek,
  offRule,
  offRuleHeads,
  periodOf,
  placeOf,
} from './ladder'
import { migrate, moveBlock } from './move'
import { parseBlock } from './org'
import { DAILY_FORMAT, type DailyConfig, type NoteSpec, dailyName, dailyNote, periodNote } from './periods'
import { DEFAULT_SETTINGS, NewListModal, type TideSettings, TideSettingTab } from './settings'
import { TaskIndex, TasksBlock, fileAt } from './tasks'

const KEYS: [string, Exclude<Action, 'nextBox'>][] = [
  ['Shift-ArrowRight', 'nextState'],
  ['Shift-ArrowLeft', 'prevState'],
  ['Shift-ArrowUp', 'priorityUp'],
  ['Shift-ArrowDown', 'priorityDown'],
]

const PERIOD_COMMANDS: [string, MessageKey, (today: string) => string][] = [
  ['open-week', 'command.openWeek', (d) => isoWeek(d).week],
  ['open-month', 'command.openMonth', (d) => d.slice(0, 7)],
  ['open-year', 'command.openYear', (d) => d.slice(0, 4)],
]

const today = () => moment().format('YYYY-MM-DD')

async function readDailyConfig(app: App): Promise<DailyConfig> {
  try {
    return JSON.parse(await app.vault.adapter.read(`${app.vault.configDir}/daily-notes.json`)) as DailyConfig
  } catch {
    // the core plugin never saved its settings: its defaults are the vault root and no template
    return {}
  }
}

/** The YYYY-MM-DD date of a daily note, its name read back through the core's format; null for any other file. */
function dayOf(config: DailyConfig, path: string): string | null {
  const name = dailyName(config, path)
  const day = name === null ? null : moment(name, config.format || DAILY_FORMAT, true)
  return day?.isValid() ? day.format('YYYY-MM-DD') : null
}

/** Creates the note from its template only when nothing is at its path. Never writes over an existing file. */
async function createIfMissing(app: App, spec: NoteSpec): Promise<TFile | null> {
  const note = { ...spec, path: normalizePath(spec.path), template: spec.template && normalizePath(spec.template) }
  // the adapter also sees a file the vault has not indexed yet, such as one a git pull just wrote
  if (app.vault.getAbstractFileByPath(note.path) || (await app.vault.adapter.exists(note.path)))
    return fileAt(app, note.path)
  const template = note.template ? fileAt(app, note.template) : null
  const content = template ? (note.fill ?? String)(await app.vault.read(template)) : note.fallback
  const folder = note.path.slice(0, note.path.lastIndexOf('/'))
  if (folder && !app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder).catch(() => {})
  // vault.create refuses a path that already exists, so a race ends here instead of in an overwrite
  return app.vault.create(note.path, content).catch(() => fileAt(app, note.path))
}

/** A day, week, month or year key typed in the picker, or null when it names no real date. */
function typedPlace(key: string): Place | null {
  const kind = moment(key, 'YYYY-MM-DD', true).isValid() ? 'day' : periodOf(`${key}.md`, '')?.kind
  if (!kind || kind === 'list') return null
  const place = { kind, key }
  // the period patterns take any two digits, so 2026-13 or 2026-W54 must come back from their first day
  const first = firstDay(place)
  return moment(first, 'YYYY-MM-DD', true).isValid() && holds(place, first) ? place : null
}

interface MoveTarget {
  label: string
  place: Place
}

/** The Move to… picker: the usual places first, then the lists, plus any day, week, month or year key typed. */
class MoveModal extends FuzzySuggestModal<MoveTarget> {
  constructor(
    app: App,
    private targets: MoveTarget[],
    private choose: (place: Place) => void,
    /** Fix on a repeater: only a list fixes it, so a typed day or period is not offered */
    private listsOnly = false,
  ) {
    super(app)
    this.setPlaceholder(t(listsOnly ? 'move.placeholderList' : 'move.placeholder'))
  }

  getItems() {
    const key = this.inputEl.value.trim()
    const place = this.listsOnly ? null : typedPlace(key)
    return place ? [{ label: key, place }, ...this.targets] : this.targets
  }

  getItemText(target: MoveTarget) {
    return target.label
  }

  onChooseItem(target: MoveTarget) {
    this.choose(target.place)
  }
}

/** Org autocomplete: states, tags, planning keys, dates, repeaters, the drawer, its properties and categories. */
class OrgSuggest extends EditorSuggest<Suggestion> {
  private found: Suggestions | null = null

  constructor(
    app: App,
    private contextOf: (file: TFile | null) => Omit<SuggestContext, 'now'>,
  ) {
    super(app)
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null) {
    // only list items and the lines under them take org words
    if (!/^(\s|- )/.test(editor.getLine(cursor.line))) return null
    // ponytail: the whole note is split on each key press in a list item, as the off-rule marks do; hand orgSuggest
    // the block alone if long notes lag
    const lines = editor.getValue().split('\n')
    this.found = orgSuggest(lines, cursor.line, cursor.ch, { ...this.contextOf(file), now: new Date() })
    if (!this.found?.items.length) return null
    const { from, to } = this.found
    return { start: { line: cursor.line, ch: from }, end: { line: cursor.line, ch: to }, query: '' }
  }

  getSuggestions() {
    return this.found?.items ?? []
  }

  renderSuggestion(s: Suggestion, el: HTMLElement) {
    el.setText(s.label)
  }

  selectSuggestion(s: Suggestion) {
    if (!this.context) return
    const { editor, start, end } = this.context
    editor.replaceRange(s.text, start, end)
    editor.setCursor(editor.offsetToPos(editor.posToOffset(start) + (s.cursor ?? s.text.length)))
  }
}

function changesAt(editor: Editor, action: Action) {
  if (editor.somethingSelected()) return null
  return orgAction(editor.getValue().split('\n'), editor.getCursor().line, action, new Date())
}

/** Applies the action at the cursor; false lets the key keep its usual meaning (extend selection). */
function runAction(editor: Editor, action: Action): boolean {
  const changes = changesAt(editor, action)
  if (!changes) return false
  applyChanges(editor, changes)
  return true
}

function applyChanges(editor: Editor, changes: Change[]) {
  editor.transaction({
    changes: changes.map((c) => ({ from: editor.offsetToPos(c.from), to: editor.offsetToPos(c.to), text: c.insert })),
  })
}

/** The block at the end of the note, after its last line. */
const appendBlock = (data: string, block: string[]) =>
  `${data.trimEnd()}${data.trim() ? '\n' : ''}${block.join('\n')}\n`

const offRuleMark = (why: OffRule) =>
  Decoration.line({ class: 'tide-off-rule', attributes: { title: t(`offRule.${why}`) } })
const OFF_RULE = { repeater: offRuleMark('repeater'), scheduled: offRuleMark('scheduled') }

/**
 * The mark on the head line of each block off the rule.
 * ponytail: redrawn on edits and when the note's place changes, noticed on any interaction (cursor, focus); a list
 * marker or setting changed elsewhere shows once the note is touched. Refresh on the index's 'changed' if that matters.
 */
function offRuleMarks(homeOf: (view: EditorView) => Place | null) {
  const build = (view: EditorView, home: Place | null): DecorationSet => {
    const doc = view.state.doc
    const lines = doc.toString().split('\n')
    const builder = new RangeSetBuilder<Decoration>()
    for (const [head, why] of offRuleHeads(lines, home)) {
      const from = doc.line(head + 1).from
      builder.add(from, from, OFF_RULE[why])
    }
    return builder.finish()
  }
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      // the file may not be known yet when the editor opens, so the place is checked again on each update
      home: string
      constructor(view: EditorView) {
        const home = homeOf(view)
        this.home = JSON.stringify(home)
        this.decorations = build(view, home)
      }
      update(u: ViewUpdate) {
        const home = homeOf(u.view)
        const key = JSON.stringify(home)
        if (!u.docChanged && key === this.home) return
        this.home = key
        this.decorations = build(u.view, home)
      }
    },
    { decorations: (v) => v.decorations },
  )
}

export default class TidePlugin extends Plugin {
  settings: TideSettings = DEFAULT_SETTINGS
  /** the core Daily notes settings, read again whenever the daily is checked */
  private daily: DailyConfig = {}
  private index = new TaskIndex(this.app, () => this.places())
  private rebuild = debounce(() => void this.index.rebuild(), 500, true)
  /** the day the daily was last created for, to notice midnight */
  private dailyDay = ''
  /** a second run would read the same files and append their blocks to the daily again */
  private migrating = false
  /** Enter, Ctrl+Alt+Tab and the task visual; swapped in place when the visual changes */
  private editor: Extension[] = []
  private visual: TideSettings['visual'] | null = null

  /** Builds the editor extensions for the visual in the settings, only when it changed: Padrão folds on each build. */
  private applyVisual() {
    if (this.visual === this.settings.visual) return
    this.visual = this.settings.visual
    this.editor.splice(0, this.editor.length, ...tideEditor(this.visual))
    this.app.workspace.updateOptions()
  }

  /** The settings the ladder needs, with the core Daily notes deciding which files are days. */
  private places(): PlaceSettings {
    return { ...this.settings, dayOf: (path) => dayOf(this.daily, path) }
  }

  /** Creates today's daily from the core Daily notes settings when it is missing. */
  private async createDaily() {
    // a new day: other periods are over, so the pending notice counts again
    if (this.dailyDay && this.dailyDay !== today()) this.index.trigger('changed')
    this.dailyDay = today()
    const config = await readDailyConfig(this.app)
    // other folder or format: other files are days now
    if (JSON.stringify(config) !== JSON.stringify(this.daily)) {
      this.daily = config
      this.rebuild()
    }
    await this.day(this.dailyDay)
  }

  /** The daily note of a YYYY-MM-DD date, created from the core Daily notes template when missing. */
  private day(date: string): Promise<TFile | null> {
    const day = moment(date, 'YYYY-MM-DD')
    const spec = dailyNote(this.daily, day.format(this.daily.format || DAILY_FORMAT), (f) => day.format(f))
    return createIfMissing(this.app, spec)
  }

  /** The places Move to… offers before anything is typed. */
  private moveTargets(): MoveTarget[] {
    const now = today()
    const fixed: [MessageKey, Place][] = [
      ['move.today', { kind: 'day', key: now }],
      ['move.tomorrow', { kind: 'day', key: moment().add(1, 'day').format('YYYY-MM-DD') }],
      ['move.week', { kind: 'week', key: isoWeek(now).week }],
      ['move.month', { kind: 'month', key: now.slice(0, 7) }],
      ['move.inbox', { kind: 'list', key: this.settings.inbox }],
    ]
    const lists = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path !== this.settings.inbox)
      .flatMap((f) => {
        const place = placeOf(f.path, this.app.metadataCache.getFileCache(f)?.frontmatter ?? null, this.places())
        return place?.kind === 'list' ? [{ label: f.basename, place }] : []
      })
    return [...fixed.map(([label, place]) => ({ label: t(label), place })), ...lists]
  }

  /** The place of a file on the ladder, or null off it. */
  private placeOfFile(file: TFile): Place | null {
    return placeOf(file.path, this.app.metadataCache.getFileCache(file)?.frontmatter ?? null, this.places())
  }

  /** The block at the cursor when it is off the rule, and why. */
  private offRuleAt(editor: Editor, file: TFile, cursor: number) {
    const lines = editor.getValue().split('\n')
    const range = findBlock(lines, cursor)
    // a block found by findBlock always parses
    const block = range && parseBlock(lines.slice(range.start, range.end))!
    const why = block && offRule(block, this.placeOfFile(file))
    return why ? { block, why } : null
  }

  /** Fix: a repeater goes to a list, a daily's SCHEDULED on another day goes to that day; both by Move to…. */
  private fix(editor: Editor, file: TFile, cursor: number) {
    const off = this.offRuleAt(editor, file, cursor)
    if (off?.why === 'scheduled')
      void this.moveTo(editor, file, cursor, { kind: 'day', key: off.block.scheduled!.date })
    if (off?.why !== 'repeater') return
    const lists = this.moveTargets().filter((target) => target.place.kind === 'list')
    new MoveModal(this.app, lists, (dest) => void this.moveTo(editor, file, cursor, dest), true).open()
  }

  /** Move to… on the block at the cursor: write it at the destination first, then cut it, so a failure duplicates instead of losing it. */
  private async moveTo(editor: Editor, from: TFile, cursor: number, dest: Place) {
    const lines = editor.getValue().split('\n')
    const home = this.placeOfFile(from)
    const result = moveBlock(lines, cursor, home, dest, today())
    if (!result) return
    // only a block that leaves needs the destination, so a postpone never creates a note
    if (result.moved) {
      const file =
        dest.kind === 'day'
          ? await this.day(dest.key)
          : dest.kind === 'list'
            ? await createIfMissing(this.app, { path: dest.key, template: null, fallback: '' })
            : await this.period(dest.key)
      if (!file) return
      await this.app.vault.process(file, (data) => appendBlock(data, result.moved!))
      // edited meanwhile: the cut would land on the wrong lines, so the block stays in both places
      if (editor.getValue() !== lines.join('\n')) return
    }
    applyChanges(editor, diffLines(lines, result.source))
  }

  /** Migrate pending to today: each file's pending blocks go to the end of today's daily first, then leave the file. */
  private async migratePending() {
    if (this.migrating) return
    this.migrating = true
    try {
      await this.migrateAll()
    } finally {
      this.migrating = false
    }
  }

  private async migrateAll() {
    const now = today()
    const pending = this.index.pending(now)
    const daily = pending.length ? await this.day(now) : null
    if (!daily) return
    for (const { path } of pending) {
      const file = fileAt(this.app, path)
      if (!file) continue
      const data = await this.app.vault.read(file)
      const home = placeOf(path, this.app.metadataCache.getFileCache(file)?.frontmatter ?? null, this.places())
      const result = home && migrate(data.split('\n'), home, now)
      if (!result) continue
      await this.app.vault.process(daily, (d) => appendBlock(d, result.moved))
      // edited meanwhile: the cut would land on the wrong lines, so the blocks stay in both places
      await this.app.vault.process(file, (d) => (d === data ? result.source.join('\n') : d))
    }
  }

  /** The week, month or year note of `key`, created from its template when missing; for Move to…, calendar and agenda. */
  async period(key: string): Promise<TFile | null> {
    const note = periodNote(key, this.settings)
    return note && createIfMissing(this.app, note)
  }

  async saveSettings() {
    await this.saveData(this.settings)
    this.rebuild()
    this.applyVisual()
  }

  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<TideSettings> | null) }
    this.addSettingTab(new TideSettingTab(this.app, this))
    this.daily = await readDailyConfig(this.app)
    this.applyVisual()
    this.registerEditorExtension(this.editor)

    this.app.workspace.onLayoutReady(() => void this.index.rebuild())
    // 'changed' covers edits, new files and frontmatter; it hands over the content already read
    this.registerEvent(this.app.metadataCache.on('changed', (file, data) => this.index.update(file, data)))
    this.registerEvent(this.app.vault.on('delete', (file) => this.index.remove(file.path)))
    this.registerEvent(
      this.app.vault.on('rename', async (file, oldPath) => {
        this.index.remove(oldPath)
        // the place comes from the path, so a renamed file is read again
        if (file instanceof TFile && file.extension === 'md')
          this.index.update(file, await this.app.vault.cachedRead(file))
      }),
    )
    this.registerMarkdownCodeBlockProcessor('tide-tasks', (_source, el, ctx) => {
      const place = () => placeOf(ctx.sourcePath, null, this.places())
      ctx.addChild(new TasksBlock(el, this.app, this.index, place, today, () => void this.migratePending()))
    })
    // the daily is born on startup, on coming back to the app and at midnight with the app open
    this.app.workspace.onLayoutReady(() => void this.createDaily())
    const onReturn = () => document.visibilityState === 'visible' && void this.createDaily()
    this.registerDomEvent(document, 'visibilitychange', onReturn)
    this.registerDomEvent(window, 'focus', onReturn)
    this.registerInterval(window.setInterval(() => today() !== this.dailyDay && void this.createDaily(), 60_000))
    for (const [id, name, key] of PERIOD_COMMANDS) {
      this.addCommand({
        id,
        name: t(name),
        callback: async () => {
          const file = await this.period(key(today()))
          if (file) await this.app.workspace.getLeaf(false).openFile(file)
        },
      })
    }

    // no default hotkey, as the plugin guidelines ask: Move to… gets its own in Settings → Hotkeys
    this.addCommand({
      id: 'move-to',
      name: t('command.moveTo'),
      editorCheckCallback: (checking, editor, ctx) => {
        const cursor = editor.getCursor().line
        const from = ctx.file
        if (checking) return !!from && !!findBlock(editor.getValue().split('\n'), cursor)
        if (from)
          new MoveModal(this.app, this.moveTargets(), (dest) => void this.moveTo(editor, from, cursor, dest)).open()
      },
    })

    // the plugin never fixes by itself: only this command does, on the block at the cursor
    this.addCommand({
      id: 'fix',
      name: t('command.fix'),
      editorCheckCallback: (checking, editor, ctx) => {
        const cursor = editor.getCursor().line
        const file = ctx.file
        if (checking) return !!file && !!this.offRuleAt(editor, file, cursor)
        if (file) this.fix(editor, file, cursor)
      },
    })
    this.registerEditorSuggest(
      new OrgSuggest(this.app, (file) => {
        const place = file && this.placeOfFile(file)
        return {
          list: place?.kind === 'list',
          day: place?.kind === 'day' ? place.key : null,
          ...this.index.vocabulary(),
        }
      }),
    )
    this.registerEditorExtension(
      offRuleMarks((view) => {
        const file = view.state.field(editorInfoField, false)?.file
        return file ? this.placeOfFile(file) : null
      }),
    )

    // never runs by itself: only this command and the button of the notice in today's daily
    this.addCommand({
      id: 'migrate-pending',
      name: t('command.migrate'),
      callback: () => void this.migratePending(),
    })

    this.addCommand({
      id: 'new-list',
      name: t('command.newList'),
      callback: () => new NewListModal(this.app, this.settings).open(),
    })

    this.registerEditorExtension(
      Prec.highest(
        keymap.of(
          KEYS.map(([key, action]) => ({
            key,
            run: (view) => {
              const editor = view.state.field(editorInfoField, false)?.editor
              return !!editor && runAction(editor, action)
            },
          })),
        ),
      ),
    )

    // Ctrl+Alt+Tab from the command palette, for touch screens and desktops that keep the key for themselves
    this.addCommand({
      id: 'toggle-tasks',
      name: t('command.toggleTasks'),
      // ponytail: Editor.cm is Obsidian's EditorView, there at runtime but not in the API types
      editorCallback: (editor) => void foldTasks((editor as unknown as { cm: EditorView }).cm, 'toggle'),
    })

    // the same actions from the command palette, for touch screens without Shift+arrows
    for (const [, action] of KEYS) {
      this.addCommand({
        id: action,
        name: t(`command.${action}`),
        editorCheckCallback: (checking, editor) => {
          if (checking) return changesAt(editor, action) !== null
          runAction(editor, action)
        },
      })
    }
  }
}
