import { Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { type Editor, Plugin, TFile, debounce, editorInfoField } from 'obsidian'
import { type Action, orgAction } from './actions'
import { t } from './i18n'
import { placeOf } from './ladder'
import { DEFAULT_SETTINGS, NewListModal, type TideSettings, TideSettingTab } from './settings'
import { TaskIndex, TasksBlock } from './tasks'

const KEYS: [string, Action][] = [
  ['Shift-ArrowRight', 'nextState'],
  ['Shift-ArrowLeft', 'prevState'],
  ['Shift-ArrowUp', 'priorityUp'],
  ['Shift-ArrowDown', 'priorityDown'],
]

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
