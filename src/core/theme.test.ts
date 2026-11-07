import { describe, expect, it } from 'vitest'
import { resolveTheme } from './theme.ts'

describe('resolveTheme', () => {
  it('defaults to dark', () => expect(resolveTheme(null, false)).toBe('dark'))
  it('follows the OS when nothing is stored', () => expect(resolveTheme(null, true)).toBe('light'))
  it('stored choice wins over the OS', () => {
    expect(resolveTheme('dark', true)).toBe('dark')
    expect(resolveTheme('light', false)).toBe('light')
  })
  it('ignores junk', () => expect(resolveTheme('blue', false)).toBe('dark'))
})
