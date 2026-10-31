import type { Place } from './ladder'
import type { OrgBlock, Priority, State } from './org'

/** One task of the vault, wherever it lives, on the ladder or not. */
export interface ListedTask {
  path: string
  line: number
  /** the head line as indexed, to find the task again before writing */
  head: string
  block: OrgBlock
  /** null off the ladder */
  home: Place | null
}

/** '' shows everything; '-' shows the tasks without a priority, place or category. */
export interface ListFilter {
  /** open is TODO and DOING */
  state: 'all' | 'open' | State
  priority: '' | '-' | Priority
  place: '' | '-' | Place['kind']
  about: string
  tag: string
  category: string
}

export const ALL: ListFilter = { state: 'all', priority: '', place: '', about: '', tag: '', category: '' }

const property = (b: OrgBlock, key: string) => b.properties?.find(([k]) => k.toUpperCase() === key)?.[1].trim() ?? ''

/** The notes in :ABOUT:, by name without the alias; plain text when it holds no link. */
export function aboutOf(b: OrgBlock): string[] {
  const value = property(b, 'ABOUT')
  const links = [...value.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim())
  return links.length || !value ? links : [value]
}

export const categoryOf = (b: OrgBlock) => property(b, 'CATEGORY')

/** A filter on an optional value: '' takes all, '-' takes the missing ones. */
const matches = (want: string, value: string | null | undefined) => !want || (want === '-' ? !value : value === want)

/** The tasks that pass every filter, the higher priority first, then by title. */
export function filterTasks(tasks: ListedTask[], f: ListFilter): ListedTask[] {
  const rank = (t: ListedTask) => t.block.priority ?? 'D'
  return tasks
    .filter(({ block: b, home }) => {
      const state =
        f.state === 'all' || (f.state === 'open' ? b.state === 'TODO' || b.state === 'DOING' : b.state === f.state)
      return (
        state &&
        matches(f.priority, b.priority) &&
        matches(f.place, home?.kind) &&
        (!f.about || aboutOf(b).includes(f.about)) &&
        (!f.tag || b.tags.includes(f.tag)) &&
        matches(f.category, categoryOf(b))
      )
    })
    .sort((a, b) => rank(a).localeCompare(rank(b)) || a.block.title.localeCompare(b.block.title))
}

/** The abouts, tags and categories in use, for the filters' choices. */
export function filterOptions(tasks: ListedTask[]) {
  const sorted = (values: string[]) => [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b))
  return {
    abouts: sorted(tasks.flatMap((t) => aboutOf(t.block))),
    tags: sorted(tasks.flatMap((t) => t.block.tags)),
    categories: sorted(tasks.map((t) => categoryOf(t.block))),
  }
}
