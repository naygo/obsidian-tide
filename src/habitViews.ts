import { type Events, ItemView, Platform, type WorkspaceLeaf, setIcon } from 'obsidian'
import { monthDays, shiftMonth, yearWeeks } from './calendar'
import { type Declaration, pausedBy } from './contexts'
import { type Habit, pace, plannedOn } from './habits'
import { type MessageKey, t } from './i18n'

export const HABITS_VIEW = 'tide-habits'

/**
 * The month board: on a desktop a row per habit and the days across, on a phone a row per day. A cell writes to the
 * daily of its day, created when missing: a tap marks a yes/no habit, a habit with a unit opens a number field. A
 * future cell is ahead, read-only; a day off the planned ones is dimmed, but a mark there counts the same, as on a
 * day a context pauses. Below it, the pace of each goal today, the declarations that touch the month, and the year of
 * the month in a grid per habit.
 */
export class HabitsView extends ItemView {
  private month: string

  constructor(
    leaf: WorkspaceLeaf,
    private habits: () => Habit[],
    /** the amount of each marked day of a habit, by date, from the log in its note */
    private amounts: (habit: Habit) => Record<string, number>,
    private today: () => string,
    private mark: (date: string, habit: Habit, amount: number) => void,
    /** the declarations of each context note, by its name */
    private contexts: () => { name: string; declarations: Declaration[] }[],
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
    const amounts = new Map(habits.map((h) => [h, this.amounts(h)]))
    const table = this.contentEl.createDiv({ cls: 'tide-board-scroll' }).createEl('table', { cls: 'tide-board' })
    const head = table.createEl('thead').createEl('tr')
    head.createEl('th')
    const body = table.createEl('tbody')
    const contexts = this.contexts()
    const cell = (tr: HTMLElement, habit: Habit, date: string) =>
      this.fill(
        tr.createEl('td'),
        habit,
        date,
        amounts.get(habit)![date] ?? 0,
        today,
        pausedBy(contexts, habit.name, date),
      )
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

    const paced = habits.flatMap((habit) => {
      const p = pace(habit, today, amounts.get(habit)!)
      return p ? [{ habit, ...p }] : []
    })
    if (paced.length) {
      this.contentEl.createEl('h4', { text: t('habits.pace') })
      const ul = this.contentEl.createEl('ul', { cls: 'tide-habits' })
      for (const { habit, goal, done, left, daysLeft } of paced) {
        const li = ul.createEl('li').createSpan({ cls: 'tide-habit' })
        this.habitName(li, habit)
        const per = `${done}/${goal.amount} ${t(`habits.per.${goal.per}`)}`
        const days = `${daysLeft} ${t(daysLeft === 1 ? 'habits.pace.day' : 'habits.pace.days')}`
        li.createSpan({
          cls: 'tide-habit-goal',
          text: left ? `${per} · ${left} ${t('habits.pace.toGo')} ${days}` : `${per} · ${t('habits.pace.met')}`,
        })
      }
    }

    const touching = contexts
      .flatMap((c) => c.declarations.map((d) => ({ ...d, context: c.name })))
      .filter((d) => d.from <= days[days.length - 1] && days[0] <= d.to)
    if (touching.length) {
      this.contentEl.createEl('h4', { text: t('habits.contexts') })
      const ul = this.contentEl.createEl('ul', { cls: 'tide-board-contexts' })
      for (const d of touching)
        ul.createEl('li', { text: `${d.context} · ${d.from} → ${d.to} · ${d.habits.join(', ')}` })
    }

    // ponytail: a year of cells per habit, drawn again on every change; draw only the grids in view if it lags
    const year = this.month.slice(0, 4)
    this.contentEl.createEl('h4', { text: `${t('habits.year')} ${year}` })
    const yearDays = yearWeeks(year).flat()
    for (const habit of habits) {
      this.habitName(this.contentEl.createDiv({ cls: 'tide-year-name' }), habit)
      const grid = this.contentEl.createDiv({ cls: 'tide-board-scroll' }).createDiv({ cls: 'tide-year' })
      if (habit.color) grid.addClass(`tide-habit-${habit.color}`)
      for (const date of yearDays) {
        const square = grid.createDiv({ cls: 'tide-year-day' })
        if (!date) {
          square.addClass('tide-year-out')
          continue
        }
        const amount = amounts.get(habit)![date] ?? 0
        const paused = pausedBy(contexts, habit.name, date)
        if (amount) square.addClass('tide-year-marked')
        if (paused.length) square.addClass('tide-year-paused')
        if (date > today) square.addClass('tide-year-ahead')
        const notes = [
          habit.unit && amount ? `${amount} ${habit.unit}` : '',
          paused.length ? this.pausedText(paused) : '',
        ]
        square.setAttr('title', [date, ...notes.filter(Boolean)].join(' · '))
      }
    }
  }

  private pausedText(contexts: string[]) {
    return `${t('habits.paused')} ${contexts.join(', ')}`
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

  private fill(
    td: HTMLElement,
    habit: Habit,
    date: string,
    amount: number,
    today: string,
    /** the contexts that pause the habit on the date */
    paused: string[],
  ) {
    td.setAttr('aria-label', `${habit.name} ${date}`)
    if (habit.color) td.addClass(`tide-habit-${habit.color}`)
    if (date === today) td.addClass('tide-board-today')
    // a pause shows ahead too, as declared days to come; a mark on a paused day counts the same
    if (paused.length) {
      td.addClass('tide-board-paused')
      td.setAttr('title', this.pausedText(paused))
    }
    if (date > today) {
      // a tooltip never shows on a phone, so the cell says it too
      td.addClass('tide-board-ahead')
      td.setAttr('title', [t('habits.ahead'), ...(paused.length ? [this.pausedText(paused)] : [])].join(' · '))
      td.setText('·')
      return
    }
    if (!plannedOn(habit, date)) td.addClass('tide-board-off')
    if (!habit.unit) {
      const box = td.createEl('input', { type: 'checkbox' })
      box.checked = amount > 0
      box.addEventListener('change', () => this.mark(date, habit, box.checked ? 1 : 0))
      return
    }
    const button = td.createEl('button', { cls: 'tide-board-amount', text: amount ? String(amount) : '' })
    if (amount) button.addClass('tide-board-filled')
    button.addEventListener('click', () => {
      button.remove()
      const field = createEl('input', { type: 'number', cls: 'tide-habit-amount tide-board-field' })
      field.min = '0'
      field.inputMode = 'decimal'
      field.value = amount ? String(amount) : ''
      field.addEventListener('change', () => this.mark(date, habit, Number(field.value) || 0))
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
