import { type App, Modal, Notice, normalizePath, PluginSettingTab, Setting } from 'obsidian'
import { t } from './i18n'
import { type PlaceSettings, parseMarker } from './ladder'
import type TidePlugin from './main'

export type TideSettings = PlaceSettings

export const DEFAULT_SETTINGS: TideSettings = {
  periodsFolder: '',
  inbox: 'inbox.md',
  listMarker: 'categories: [[lists]]',
}

export class TideSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: TidePlugin,
  ) {
    super(app, plugin)
  }

  display() {
    this.containerEl.empty()
    for (const key of ['periodsFolder', 'inbox', 'listMarker'] as const) {
      new Setting(this.containerEl)
        .setName(t(`settings.${key}`))
        .setDesc(t(`settings.${key}.desc`))
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_SETTINGS[key])
            .setValue(this.plugin.settings[key])
            .onChange(async (value) => {
              // stored as vault paths, so `inbox` and `/inbox.md` both match inbox.md
              const v = value.trim()
              this.plugin.settings[key] =
                key === 'listMarker' || !v ? v : normalizePath(key === 'inbox' && !v.endsWith('.md') ? v + '.md' : v)
              await this.plugin.saveSettings()
            }),
        )
    }
  }
}

/** Asks for a name and creates the list note with the configured marker. */
export class NewListModal extends Modal {
  constructor(
    app: App,
    private settings: TideSettings,
  ) {
    super(app)
  }

  onOpen() {
    this.setTitle(t('command.newList'))
    let name = ''
    const submit = () => {
      if (!name.trim()) return
      this.close()
      void createList(this.app, this.settings.listMarker, name.trim())
    }
    new Setting(this.contentEl).setName(t('newList.name')).addText((text) => {
      text.onChange((v) => (name = v))
      text.inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit()
      })
    })
    new Setting(this.contentEl).addButton((b) => b.setButtonText(t('newList.create')).setCta().onClick(submit))
  }

  onClose() {
    this.contentEl.empty()
  }
}

async function createList(app: App, marker: string, name: string) {
  const m = parseMarker(marker)
  const path = normalizePath('folder' in m ? `${m.folder}/${name}.md` : `${name}.md`)
  if (app.vault.getAbstractFileByPath(path)) {
    new Notice(t('newList.exists'))
    return
  }
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  if (folder && !app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder)
  let file
  try {
    file = await app.vault.create(path, '')
  } catch {
    new Notice(t('newList.invalid'))
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
