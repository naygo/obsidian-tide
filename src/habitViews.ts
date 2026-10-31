import { type App, MarkdownRenderChild, setIcon } from 'obsidian'
import { type Habit, isMarked, plannedOn } from './habits'
import { t } from './i18n'

/** The tide-habits block of a daily: the habits planned on its weekday, a tap marking or unmarking each. */
export class HabitsBlock extends MarkdownRenderChild {
  constructor(
    el: HTMLElement,
    private app: App,
    private sourcePath: string,
    /** read on each render, so a change in the settings reaches open blocks; null outside a daily */
    private day: () => string | null,
    private habits: () => Habit[],
    private today: () => string,
    private toggle: (date: string, habit: Habit) => void,
  ) {
    super(el)
  }

  onload() {
    // ponytail: any note's metadata redraws every open block; filter to the daily and the habits if it lags
    this.registerEvent(this.app.metadataCache.on('changed', () => this.render()))
    this.render()
  }

  private render() {
    this.containerEl.empty()
    const date = this.day()
    // ponytail: a habit with a unit waits for its numeric field (#22)
    const habits = date ? this.habits().filter((h) => !h.unit && plannedOn(h, date)) : []
    if (!date || !habits.length) return
    const fm = this.app.metadataCache.getCache(this.sourcePath)?.frontmatter
    const future = date > this.today()
    const ul = this.containerEl.createEl('ul', { cls: 'tide-habits' })
    for (const habit of habits) {
      const label = ul.createEl('li').createEl('label', { cls: 'tide-habit' })
      if (habit.color) label.addClass(`tide-habit-${habit.color}`)
      const box = label.createEl('input', { type: 'checkbox' })
      box.checked = isMarked(fm, habit.name)
      box.disabled = future
      if (future) label.setAttr('title', t('habits.future'))
      box.addEventListener('change', () => this.toggle(date, habit))
      if (habit.icon) setIcon(label.createSpan({ cls: 'tide-habit-icon' }), habit.icon)
      label.createSpan({ text: habit.name })
    }
  }
}
