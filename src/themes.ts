/** The color themes: Obsidian's own colors, which follow its mode, or a palette fixed to light or dark. */
export const THEMES = [
  'obsidian',
  'doom-one-dark',
  'doom-one-light',
  'doom-emacs-dark',
  'doom-emacs-light',
  'gruvbox-dark',
  'gruvbox-light',
  'solarized-dark',
  'solarized-light',
  'catppuccin-dark',
  'catppuccin-light',
] as const
export type Theme = (typeof THEMES)[number]

/** The saved theme; one saved before the modes were listed apart (`gruvbox`) takes the variant of the current mode. */
export function themeOf(saved: unknown, dark: boolean): Theme {
  return (
    THEMES.find((t) => t === saved) ??
    THEMES.find((t) => t === `${String(saved)}-${dark ? 'dark' : 'light'}`) ??
    'obsidian'
  )
}
