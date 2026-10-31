import { type App, Modal, Notice, normalizePath, PluginSettingTab, Setting, type SettingDefinitionItem } from 'obsidian'
import type { Visual } from './editor'
import { t } from './i18n'
import { type PlaceSettings, parseMarker } from './ladder'
import type TidePlugin from './main'
import type { PeriodSettings } from './periods'

/** What the settings tab saves; the days come from the core Daily notes instead. */
export type TideSettings = Omit<PlaceSettings, 'dayOf'> &
  PeriodSettings & { habitMarker: string; visual: Visual; theme: Theme }

/** The color themes; each has a light and a dark variant, picked by Obsidian's mode in styles.css. */
export const THEMES = ['obsidian', 'doom-one', 'gruvbox', 'solarized', 'catppuccin'] as const
export type Theme = (typeof THEMES)[number]

export const DEFAULT_SETTINGS: TideSettings = {
  periodsFolder: '',
  inbox: 'inbox.md',
  listMarker: 'categories: [[lists]]',
  habitMarker: 'categories: [[habits]]',
  templatesFolder: 'templates',
  visual: 'org',
  theme: 'obsidian',
}

const PATHS = ['periodsFolder', 'inbox', 'listMarker', 'habitMarker', 'templatesFolder'] as const

export class TideSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: TidePlugin,
  ) {
    super(app, plugin)
  }

  /** Also what makes the settings show in Obsidian's settings search, from 1.13 on. */
  getSettingDefinitions(): SettingDefinitionItem<keyof TideSettings>[] {
    const paths = PATHS.map((key) => ({
      name: t(`settings.${key}`),
      desc: t(`settings.${key}.desc`),
      control: { type: 'text' as const, key, placeholder: DEFAULT_SETTINGS[key] },
    }))
    const dropdown = (key: 'visual' | 'theme', options: Record<string, string>) => ({
      name: t(`settings.${key}`),
      desc: t(`settings.${key}.desc`),
      control: { type: 'dropdown' as const, key, options },
    })
    return [
      ...paths,
      dropdown('visual', { org: t('settings.visual.org'), standard: t('settings.visual.standard') }),
      dropdown('theme', Object.fromEntries(THEMES.map((theme) => [theme, t(`settings.theme.${theme}`)]))),
    ]
  }

  getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof TideSettings]
  }

  /** Paths are stored as vault paths, so `inbox` and `/inbox.md` both match inbox.md; a marker stays as typed. */
  async setControlValue(key: string, value: unknown) {
    const v = String(value).trim()
    const path = (PATHS as readonly string[]).includes(key) && !key.endsWith('Marker') && v
    const stored = path ? normalizePath(key === 'inbox' && !v.endsWith('.md') ? v + '.md' : v) : v
    Object.assign(this.plugin.settings, { [key]: stored })
    await this.plugin.saveSettings()
  }

  /** Before 1.13, Obsidian calls this instead: the same definitions, drawn by hand. */
  display() {
    this.containerEl.empty()
    for (const def of this.getSettingDefinitions()) {
      if (!('control' in def) || !def.control) continue
      const { control } = def
      const value = String(this.getControlValue(control.key))
      const setting = new Setting(this.containerEl).setName(def.name).setDesc(def.desc ?? '')
      const save = (v: string) => void this.setControlValue(control.key, v)
      if (control.type === 'text')
        setting.addText((text) =>
          text
            .setPlaceholder(control.placeholder ?? '')
            .setValue(value)
            .onChange(save),
        )
      if (control.type === 'dropdown')
        setting.addDropdown((d) => d.addOptions(control.options).setValue(value).onChange(save))
    }
  }
}

/** Asks for one line of text and hands it over trimmed; blank text does nothing. */
export class TextModal extends Modal {
  constructor(
    app: App,
    private texts: { title: string; label: string; button: string },
    private onSubmit: (text: string) => void,
  ) {
    super(app)
  }

  onOpen() {
    this.setTitle(this.texts.title)
    let value = ''
    const submit = () => {
      if (!value.trim()) return
      this.close()
      this.onSubmit(value.trim())
    }
    new Setting(this.contentEl).setName(this.texts.label).addText((text) => {
      text.onChange((v) => (value = v))
      text.inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit()
      })
    })
    new Setting(this.contentEl).addButton((b) => b.setButtonText(this.texts.button).setCta().onClick(submit))
  }

  onClose() {
    this.contentEl.empty()
  }
}

/** Creates a list or habit note with the configured marker and opens it. */
export async function createMarked(app: App, marker: string, name: string) {
  const m = parseMarker(marker)
  const path = normalizePath('folder' in m ? `${m.folder}/${name}.md` : `${name}.md`)
  if (app.vault.getAbstractFileByPath(path)) {
    new Notice(t('newNote.exists'))
    return
  }
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  if (folder && !app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder)
  let file
  try {
    file = await app.vault.create(path, '')
  } catch {
    new Notice(t('newNote.invalid'))
    return
  }
  if ('property' in m) {
    await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      // links go in a list, as in `categories`; any other value stays a plain property
      fm[m.property] = m.value.startsWith('[[') ? [m.value] : m.value
    })
  }
  await app.workspace.getLeaf(false).openFile(file)
}
