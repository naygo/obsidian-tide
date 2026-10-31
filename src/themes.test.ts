import { describe, expect, it } from 'vitest'
import { themeOf } from './themes'

describe('themeOf', () => {
  it('keeps a theme that names its mode, whatever mode Obsidian is in', () => {
    expect(themeOf('gruvbox-dark', false)).toBe('gruvbox-dark')
  })

  it('gives a theme saved without a mode the variant of the current one', () => {
    expect(themeOf('gruvbox', true)).toBe('gruvbox-dark')
    expect(themeOf('doom-one', false)).toBe('doom-one-light')
  })

  it("falls back to Obsidian's own for anything unknown", () => {
    expect(themeOf('nope', true)).toBe('obsidian')
    expect(themeOf(undefined, true)).toBe('obsidian')
  })
})
