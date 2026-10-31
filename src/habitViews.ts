import { type App, type Events, ItemView, MarkdownRenderChild, Platform, type WorkspaceLeaf, setIcon } from 'obsidian'
import { monthDays, shiftMonth } from './calendar'
import { type Habit, amountOf, isMarked, orphanKeys, plannedOn, progress, setAmount, toggleMark } from './habits'
import { type MessageKey, t } from './i18n'

export const HABITS_VIEW = 'tide-habits'

/**
 * The tide-habits block of a daily: the habits planned on its weekday, and the others folded below, since a mark off
 * the planned days counts the same; a habit a context pauses on the day is in neither. A tap marks a yes/no habit; a
 * habit with a unit takes a number. A mark no habit note has is an orphan, shown with a button to fix it.
 */
export class HabitsBlock extends MarkdownRenderChild {
  /** kept across renders, so marking a habit among the others doesn't fold them away */
  private othersOpen = false

  constructor(
    el: HTMLElement,
    private app: App,
    private sourcePath: string,
    /** read on each render, so a change in the settings reaches open blocks; null outside a daily */
    private day: () => string | null,
    private habits: () => Habit[],
    private today: () => string,
    /** the amount of each daily by date, for the goal's progress */
    private amounts: (habit: Habit) => Record<string, number>,
    private mark: (date: string, edit: (fm: Record<string, unknown>) => void) => void,
    /** the lowercased names of the habits paused on a date */
    private paused: (date: string) => Set<string>,
    /** fires 'changed' after any note's metadata or text is read again, so a mark or a declaration redraws */
    private changes: Events,
    /** Fix on an orphan: the plugin never fixes by itself */
    private fixOrphan: (key: string) => void,
  ) {
    super(el)
  }

  onload() {
    // ponytail: any note's metadata redraws every open block; filter to the dailies and the habits if it lags,
    // keeping the other dailies of a goal's period, whose marks its progress sums
    this.registerEvent(this.changes.on('changed', () => this.render()))
    this.render()
  }

  private render() {
    this.containerEl.empty()
    const date = this.day()
    if (!date) return
    const paused = this.paused(date)
    const all = this.habits()
    const habits = all.filter((h) => !h.archived && !paused.has(h.name.toLowerCase()))
    const planned = habits.filter((h) => plannedOn(h, date))
    const others = habits.filter((h) => !plannedOn(h, date))
    const orphans = orphanKeys(
      this.app.metadataCache.getCache(this.sourcePath)?.frontmatter,
      all.map((h) => h.name),
    )
    if (planned.length) this.list(this.containerEl, planned, date)
    if (orphans.length) this.orphans(orphans)
    if (others.length) {
      const details = this.containerEl.createEl('details', { cls: 'tide-habits-others' })
      details.open = this.othersOpen
      details.addEventListener('toggle', () => (this.othersOpen = details.open))
      details.createEl('summary', { text: t('habits.others') })
      this.list(details, others, date)
    }
  }

  private orphans(keys: string[]) {
    const ul = this.containerEl.createEl('ul', { cls: 'tide-habits' })
    for (const key of keys) {
      const li = ul.createEl('li', { cls: 'tide-habit tide-habit-orphan', attr: { title: t('orphan.mark') } })
      li.createSpan({ text: key })
      li.createEl('button', { text: t('orphan.fix') }).addEventListener('click', () => this.fixOrphan(key))
    }
  }

  private list(parent: HTMLElement, habits: Habit[], date: string) {
    const fm = this.app.metadataCache.getCache(this.sourcePath)?.frontmatter
    const future = date > this.today()
    const ul = parent.createEl('ul', { cls: 'tide-habits' })
    for (const habit of habits) {
      const label = ul.createEl('li').createEl('label', { cls: 'tide-habit' })
      if (habit.color) label.addClass(`tide-habit-${habit.color}`)
      if (future) label.setAttr('title', t('habits.future'))
      if (habit.unit) {
        const field = label.createEl('input', { type: 'number', cls: 'tide-habit-amount' })
        field.min = '0'
        field.inputMode = 'decimal'
        const amount = amountOf(fm, habit.name)
        field.value = amount ? String(amount) : ''
        field.disabled = future
        // on change, not on input: each write redraws the block, which would take the focus on every key
        field.addEventListener('change', () => this.mark(date, (f) => setAmount(f, habit.name, Number(field.value))))
      } else {
        const box = label.createEl('input', { type: 'checkbox' })
        box.checked = isMarked(fm, habit.name)
        box.disabled = future
        box.addEventListener('change', () => this.mark(date, (f) => toggleMark(f, habit.name)))
      }
      if (habit.icon) setIcon(label.createSpan({ cls: 'tide-habit-icon' }), habit.icon)
      label.createSpan({ text: habit.unit ? `${habit.name} (${habit.unit})` : habit.name })
      if (habit.goal) {
        const done = progress(habit, date, this.amounts(habit))
        label.createSpan({
          cls: 'tide-habit-goal',
          text: `${done}/${habit.goal.amount} ${t(`habits.per.${habit.goal.per}`)}`,
        })
      }
    }
  }
}

/**
 * The month board: on a desktop a row per habit and the days across, on a phone a row per day. A cell writes to the
 * daily of its day, created when missing: a tap marks a yes/no habit, a habit with a unit opens a number field. A
 * future cell is ahead, read-only; a day off the planned ones is dimmed, but a mark there counts the same.
 */
export class HabitsView extends ItemView {
  private month: string

  constructor(
    leaf: WorkspaceLeaf,
    private habits: () => Habit[],
    /** the frontmatter of each daily by date */
    private frontmatters: () => Record<string, Record<string, unknown>>,
    private today: () => string,
    private mark: (date: string, edit: (fm: Record<string, unknown>) => void) => void,
    /** fires 'changed' after any note's metadata is read again, and on a new day */
    private changes: Events,
  ) {
    super(leaf)
    this.month = today().slice(0, 7)
  }

  getViewType() {
    return HABITS_VIEW
  }

  getDisplayText() {
    return t('habits.title')
  }

  getIcon() {
    return 'calendar-check'
  }

  async onOpen() {
    this.registerEvent(this.changes.on('changed', () => this.render()))
    this.render()
  }

  private go(month: string) {
    this.month = month
    this.render()
  }

  private render() {
    // a number being typed keeps its field; the write it commits redraws the board after
    const focused = this.contentEl.doc.activeElement
    if (focused?.hasClass('tide-board-field') && this.contentEl.contains(focused)) return
    this.contentEl.empty()
    const today = this.today()
    const nav = this.contentEl.createDiv({ cls: 'tide-calendar-nav' })
    this.button(nav, 'chevron-left', 'calendar.prev', () => this.go(shiftMonth(this.month, -1)))
    nav.createSpan({ text: this.month })
    this.button(nav, 'chevron-right', 'calendar.next', () => this.go(shiftMonth(this.month, 1)))
    nav.createEl('button', { text: t('calendar.today') }).addEventListener('click', () => this.go(today.slice(0, 7)))

    const habits = this.habits().filter((h) => !h.archived)
    if (!habits.length) return void this.contentEl.createDiv({ cls: 'tide-empty', text: t('habits.empty') })
    const days = monthDays(this.month)
    const frontmatters = this.frontmatters()
    const table = this.contentEl.createDiv({ cls: 'tide-board-scroll' }).createEl('table', { cls: 'tide-board' })
    const head = table.createEl('thead').createEl('tr')
    head.createEl('th')
    const body = table.createEl('tbody')
    const cell = (tr: HTMLElement, habit: Habit, date: string) =>
      this.fill(tr.createEl('td'), habit, date, frontmatters[date], today)
    if (Platform.isPhone) {
      for (const habit of habits) this.habitName(head.createEl('th'), habit)
      for (const date of days) {
        const tr = body.createEl('tr')
        this.dayName(tr.createEl('th'), date, today)
        for (const habit of habits) cell(tr, habit, date)
      }
    } else {
      for (const date of days) this.dayName(head.createEl('th'), date, today)
      for (const habit of habits) {
        const tr = body.createEl('tr')
        this.habitName(tr.createEl('th'), habit)
        for (const date of days) cell(tr, habit, date)
      }
    }
  }

  private habitName(th: HTMLElement, habit: Habit) {
    if (habit.color) th.addClass(`tide-habit-${habit.color}`)
    if (habit.icon) setIcon(th.createSpan({ cls: 'tide-habit-icon' }), habit.icon)
    th.createSpan({ text: habit.unit ? `${habit.name} (${habit.unit})` : habit.name })
  }

  private dayName(th: HTMLElement, date: string, today: string) {
    th.setText(String(Number(date.slice(8))))
    if (date === today) th.addClass('tide-board-today')
  }

  private fill(td: HTMLElement, habit: Habit, date: string, fm: Record<string, unknown> | undefined, today: string) {
    td.setAttr('aria-label', `${habit.name} ${date}`)
    if (date > today) {
      // a tooltip never shows on a phone, so the cell says it too
      td.addClass('tide-board-ahead')
      td.setAttr('title', t('habits.ahead'))
      td.setText('·')
      return
    }
    if (!plannedOn(habit, date)) td.addClass('tide-board-off')
    if (!habit.unit) {
      const box = td.createEl('input', { type: 'checkbox' })
      box.checked = isMarked(fm, habit.name)
      box.addEventListener('change', () => this.mark(date, (f) => toggleMark(f, habit.name)))
      return
    }
    const amount = amountOf(fm, habit.name)
    const button = td.createEl('button', { cls: 'tide-board-amount', text: amount ? String(amount) : '' })
    button.addEventListener('click', () => {
      button.remove()
      const field = createEl('input', { type: 'number', cls: 'tide-habit-amount tide-board-field' })
      field.min = '0'
      field.inputMode = 'decimal'
      field.value = amount ? String(amount) : ''
      field.addEventListener('change', () => this.mark(date, (f) => setAmount(f, habit.name, Number(field.value))))
      // Enter commits and Escape cancels, both by leaving the field, which fires change only on a new value
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') field.value = amount ? String(amount) : ''
        if (e.key === 'Enter' || e.key === 'Escape') field.blur()
      })
      // the button back in place rather than a redraw, which would swallow the click that took the focus away
      field.addEventListener('blur', () => field.replaceWith(button))
      td.appendChild(field)
      field.focus()
    })
  }

  private button(el: HTMLElement, icon: string, label: MessageKey, click: () => void) {
    const button = el.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': t(label) } })
    setIcon(button, icon)
    button.addEventListener('click', click)
  }
}
