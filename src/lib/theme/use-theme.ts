import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

export const THEME_KEY = 'somanami-theme'

function systemTheme(): Theme {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/** The theme the learner chose on this device, if any; storage may be blocked. */
export function readSavedTheme(): Theme | null {
  try {
    const saved = window.localStorage.getItem(THEME_KEY)
    return saved === 'light' || saved === 'dark' ? saved : null
  } catch {
    return null
  }
}

function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Private browsing can refuse storage; the choice then lasts the session.
  }
}

/**
 * Light/dark theme: follows the system until the learner picks one, then
 * remembers that choice on this device. Applied as `data-theme` on <html>,
 * which the CSS tokens in index.css key off.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    () => readSavedTheme() ?? systemTheme(),
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      saveTheme(next)
      return next
    })
  }, [])

  return { theme, toggle }
}
