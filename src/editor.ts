import { codeFolding, foldEffect, foldState, foldedRanges, unfoldEffect } from '@codemirror/language'
import { type EditorState, type Extension, Prec, StateEffect } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  keymap,
} from '@codemirror/view'
import { editorInfoField, editorLivePreviewField } from 'obsidian'
import { enterAt, findBlock, orgAction, summary, taskFolds } from './actions'
import { t } from './i18n'
import { type State, parseHead } from './org'

/** How tasks look in Live Preview: org text in colors, or Obsidian's checkbox with the details folded. */
export type Visual = 'org' | 'standard'

/** The box Obsidian draws for each state: empty, dash, checked, ×. */
const MARK: Record<State, string> = { TODO: ' ', DOING: '/', DONE: 'x', CANCELED: '-' }
const PLANNING = /^(\s*)(SCHEDULED|DEADLINE|CLOSED):/

const docLines = (state: EditorState) => state.doc.toString().split('\n')

/** The task folds of the note, as document ranges: from the end of the head to the end of its last line. */
function taskRanges(state: EditorState) {
  const { doc } = state
  return taskFolds(docLines(state)).map(({ head, end }) => ({ from: doc.line(head + 1).to, to: doc.line(end + 1).to }))
}

/** The folds that start at the end of a head line, whatever range folded them (ours or Obsidian's arrow). */
function foldsAt(state: EditorState, from: number) {
  const found: { from: number; to: number }[] = []
  foldedRanges(state).between(from, from, (a, b) => {
    if (a === from) found.push({ from: a, to: b })
  })
  return found
}

const unfoldAt = (state: EditorState, from: number) => foldsAt(state, from).map((f) => unfoldEffect.of(f))

/** Folds or unfolds every task of the note; `toggle` folds them all unless all are folded already. */
export function foldTasks(view: EditorView, fold: boolean | 'toggle'): boolean {
  const ranges = taskRanges(view.state)
  if (!ranges.length) return false
  const close = fold === 'toggle' ? ranges.some((r) => !foldsAt(view.state, r.from).length) : fold
  const effects: StateEffect<unknown>[] = close
    ? ranges.filter((r) => !foldsAt(view.state, r.from).length).map((r) => foldEffect.of(r))
    : ranges.flatMap((r) => unfoldAt(view.state, r.from))
  // with folding off in Obsidian the fold state is missing, and fold effects need it
  if (!view.state.field(foldState, false)) effects.push(StateEffect.appendConfig.of(codeFolding()))
  view.dispatch({ effects })
  return true
}

/** Enter inside a task opens an indented line; on a folded head it opens the details instead. */
function enter(view: EditorView): boolean {
  const { state } = view
  const sel = state.selection.main
  // ponytail: any open suggestion popup (ours, links, tags) owns Enter; checked through its DOM, as Obsidian has no API
  if (!sel.empty || view.composing || activeDocument.querySelector('.suggestion-container')) return false
  const line = state.doc.lineAt(sel.head)
  const folded = parseHead(line.text)?.state ? unfoldAt(state, line.to) : []
  if (folded.length) {
    view.dispatch({ effects: folded })
    return true
  }
  // in the leading whitespace or before the bullet, Enter keeps its usual meaning
  if (sel.head - line.from <= (/^\s*(- )?/.exec(line.text)?.[0].length ?? 0)) return false
  const atEnd = sel.head === line.to
  const at = enterAt(docLines(state), line.number - 1, atEnd)
  if (!at) return false
  const from = atEnd ? state.doc.line(at.after + 1).to : sel.head
  view.dispatch({
    changes: { from, insert: '\n' + at.indent },
    selection: { anchor: from + 1 + at.indent.length },
    scrollIntoView: true,
    userEvent: 'input',
  })
  return true
}

/** Advances the state of the task headed at `line` as Shift+→ does, but CANCELED wraps to TODO: the box stays a box. */
function advance(view: EditorView, line: number) {
  const changes = orgAction(docLines(view.state), line, 'nextBox', new Date())
  if (changes) view.dispatch({ changes })
}

class Checkbox extends WidgetType {
  constructor(readonly state: State) {
    super()
  }

  eq(other: Checkbox) {
    return other.state === this.state
  }

  toDOM(view: EditorView) {
    const box = createEl('input', {
      type: 'checkbox',
      cls: 'task-list-item-checkbox tide-checkbox',
      attr: { 'data-task': MARK[this.state], 'aria-label': t('command.nextState') },
    })
    box.checked = this.state === 'DONE' || this.state === 'CANCELED'
    // the cursor stays where it was; the state changes in the text, which redraws the box
    box.addEventListener('mousedown', (e) => e.preventDefault())
    box.addEventListener('click', (e) => {
      e.preventDefault()
      advance(view, view.state.doc.lineAt(view.posAtDOM(box)).number - 1)
    })
    return box
  }

  ignoreEvent() {
    return true
  }
}

class Summary extends WidgetType {
  constructor(
    readonly text: string,
    readonly from: number,
  ) {
    super()
  }

  eq(other: Summary) {
    return other.text === this.text && other.from === this.from
  }

  toDOM(view: EditorView) {
    const el = createSpan({ cls: 'tide-summary', text: this.text, attr: { 'aria-label': t('fold.open') } })
    el.addEventListener('mousedown', (e) => e.preventDefault())
    el.addEventListener('click', () => view.dispatch({ effects: unfoldAt(view.state, this.from) }))
    return el
  }

  ignoreEvent() {
    return true
  }
}

const mark = (cls: string) => Decoration.mark({ class: cls })

function decorate(state: EditorState, visual: Visual): DecorationSet {
  const { doc } = state
  const lines = docLines(state)
  const marks = []
  for (let i = 0; i < lines.length; i++) {
    const { from, to } = doc.line(i + 1)
    const planning = PLANNING.exec(lines[i])
    if (visual === 'org' && planning) {
      const at = from + planning[1].length
      marks.push(mark('tide-planning').range(at, at + planning[2].length + 1))
    }
    const head = parseHead(lines[i])
    if (!head?.state) continue
    const kw = from + head.indent.length + 2
    if (visual === 'org') {
      marks.push(mark(`tide-kw tide-kw-${head.state.toLowerCase()}`).range(kw, kw + head.state.length))
      if (head.priority) marks.push(mark('tide-pri').range(kw + head.state.length + 1, kw + head.state.length + 5))
      if (head.tags.length) marks.push(mark('tide-tags').range(to - head.tags.join(':').length - 2, to))
      continue
    }
    marks.push(Decoration.line({ class: 'tide-checkbox-line' }).range(from))
    const end = Math.min(kw + head.state.length + 1, to)
    marks.push(Decoration.replace({ widget: new Checkbox(head.state) }).range(kw, end))
    const range = findBlock(lines, i)!
    const text = foldsAt(state, to).length ? summary(lines.slice(range.start, range.end)) : ''
    // the summary stands in for the fold's own …, which stays when there is nothing to sum up
    if (text) {
      marks.push(Decoration.line({ class: 'tide-summarized' }).range(from))
      marks.push(Decoration.widget({ widget: new Summary(text, to), side: -1 }).range(to))
    }
  }
  return Decoration.set(marks, true)
}

/** The Org or Padrão look of tasks in Live Preview; Padrão folds the tasks of each note it opens. */
function visuals(visual: Visual) {
  const live = (state: EditorState) => state.field(editorLivePreviewField, false) ?? false
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      // the note may still be loading or unknown when the editor opens, so the first fold waits for both
      path: string | undefined
      folded = false
      constructor(view: EditorView) {
        this.decorations = live(view.state) ? decorate(view.state, visual) : Decoration.none
        this.foldOnOpen(view)
      }
      update(u: ViewUpdate) {
        this.foldOnOpen(u.view)
        const changed =
          u.docChanged || live(u.startState) !== live(u.state) || foldedRanges(u.startState) !== foldedRanges(u.state)
        if (changed) this.decorations = live(u.state) ? decorate(u.state, visual) : Decoration.none
      }
      foldOnOpen(view: EditorView) {
        const path = view.state.field(editorInfoField, false)?.file?.path
        if (path !== this.path) {
          this.path = path
          this.folded = false
        }
        if (visual !== 'standard' || this.folded || !path || !view.state.doc.length || !live(view.state)) return
        this.folded = true
        // no dispatch while the view updates
        window.requestAnimationFrame(() => view.dom.isConnected && foldTasks(view, true))
      }
    },
    { decorations: (v) => v.decorations },
  )
}

/** Enter, Ctrl+Alt+Tab and the look of tasks in the editor. */
export function tideEditor(visual: Visual): Extension[] {
  return [
    Prec.highest(
      keymap.of([
        { key: 'Enter', run: enter },
        { key: 'Ctrl-Alt-Tab', run: (view) => foldTasks(view, 'toggle') },
      ]),
    ),
    visuals(visual),
  ]
}
