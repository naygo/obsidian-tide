import { Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { type Editor, Plugin, editorInfoField } from 'obsidian'
import { type Action, orgAction } from './actions'
import { t } from './i18n'

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
  async onload() {
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
