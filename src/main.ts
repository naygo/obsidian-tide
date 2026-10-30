import { Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { type App, type Editor, Plugin, TFile, debounce, editorInfoField, moment } from 'obsidian'
import { type Action, orgAction } from './actions'
import { type MessageKey, t } from './i18n'
import { chain, placeOf } from './ladder'
import { type DailyConfig, type NoteSpec, dailyNote, periodNote } from './periods'
import { DEFAULT_SETTINGS, NewListModal, type TideSettings, TideSettingTab } from './settings'
import { TaskIndex, TasksBlock } from './tasks'

const KEYS: [string, Action][] = [
  ['Shift-ArrowRight', 'nextState'],
  ['Shift-ArrowLeft', 'prevState'],
  ['Shift-ArrowUp', 'priorityUp'],
  ['Shift-ArrowDown', 'priorityDown'],
]

const PERIOD_COMMANDS: [string, MessageKey, (today: string) => string][] = [
  ['open-week', 'command.openWeek', (d) => chain(d)[1]],
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

const fileAt = (app: App, path: string) => {
  const file = app.vault.getAbstractFileByPath(path)
  return file instanceof TFile ? file : null
}

/** Creates the note from its template only when nothing is at its path. Never writes over an existing file. */
async function createIfMissing(app: App, note: NoteSpec): Promise<TFile | null> {
  // the adapter also sees a file the vault has not indexed yet, such as one a git pull just wrote
  if (app.vault.getAbstractFileByPath(note.path) || (await app.vault.adapter.exists(note.path)))
    return fileAt(app, note.path)
  const template = note.template ? fileAt(app, note.template) : null
  const content = template ? await app.vault.read(template) : note.fallback
  const folder = note.path.slice(0, note.path.lastIndexOf('/'))
  if (folder && !app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder).catch(() => {})
  // vault.create refuses a path that already exists, so a race ends here instead of in an overwrite
  return app.vault.create(note.path, content).catch(() => fileAt(app, note.path))
}

function changesAt(editor: Editor, action: Action) {
  if (editor.somethingSelected()) return null
  return orgAction(editor.getValue().split('\n'), editor.getCursor().line, action, new Date())
}

/** Applies the action at the cursor; false lets the key keep its usual meaning (extend selection). */
function runAction(editor: Editor, action: Action): boolean {
  const changes = changesAt(editor, action)
  if (!changes) return false
  editor.transaction({
    changes: changes.map((c) => ({ from: editor.offsetToPos(c.from), to: editor.offsetToPos(c.to), text: c.insert })),
  })
  return true
}

export default class TidePlugin extends Plugin {
  settings: TideSettings = DEFAULT_SETTINGS
  private index = new TaskIndex(this.app, () => this.settings)
  private rebuild = debounce(() => void this.index.rebuild(), 500, true)
  /** the day the daily was last created for, to notice midnight */
  private dailyDay = ''

  /** Creates today's daily from the core Daily notes settings when it is missing. */
  private async createDaily() {
    this.dailyDay = today()
    const config = await readDailyConfig(this.app)
    await createIfMissing(this.app, dailyNote(config, moment().format(config.format || 'YYYY-MM-DD')))
  }

  /** The week, month or year note of `key`, created from its template when missing. */
  async period(key: string): Promise<TFile | null> {
    const note = periodNote(key, this.settings)
    return note && createIfMissing(this.app, note)
  }

  async saveSettings() {
    await this.saveData(this.settings)
    this.rebuild()
  }

  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<TideSettings> | null) }
    this.addSettingTab(new TideSettingTab(this.app, this))

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
      ctx.addChild(new TasksBlock(el, this.app, this.index, () => placeOf(ctx.sourcePath, null, this.settings)))
    })
    // the daily is born on startup, on coming back to the app and at midnight with the app open
    this.app.workspace.onLayoutReady(() => void this.createDaily())
    const back = () => document.visibilityState === 'visible' && void this.createDaily()
    this.registerDomEvent(document, 'visibilitychange', back)
    this.registerDomEvent(window, 'focus', back)
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
