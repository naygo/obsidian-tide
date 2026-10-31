import { type App, type Events, MarkdownRenderChild, setIcon } from 'obsidian'
import { type Habit, amountOf, isMarked, orphanKeys, plannedOn, progress, setAmount, toggleMark } from './habits'
import { t } from './i18n'

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
