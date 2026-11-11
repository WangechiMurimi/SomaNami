import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readSavedTheme, THEME_KEY, useTheme } from './use-theme.ts'

function prefersDark(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: dark } as MediaQueryList),
  )
}

beforeEach(() => {
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useTheme', () => {
  it('follows the system preference when nothing was chosen', () => {
    prefersDark(true)

    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('defaults to light when the system preference is unknown', () => {
    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('light')
  })

  it('prefers a saved choice over the system', () => {
    prefersDark(true)
    window.localStorage.setItem(THEME_KEY, 'light')

    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('light')
  })

  it('toggles, applies and remembers the choice', () => {
    const { result } = renderHook(() => useTheme())

    act(() => result.current.toggle())

    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark')
  })

  it('still toggles when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    const { result } = renderHook(() => useTheme())

    act(() => result.current.toggle())

    expect(result.current.theme).toBe('dark')
  })
})

describe('readSavedTheme', () => {
  it('ignores values that are not a theme', () => {
    window.localStorage.setItem(THEME_KEY, 'purple')

    expect(readSavedTheme()).toBeNull()
  })

  it('returns null when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(readSavedTheme()).toBeNull()
  })
})
