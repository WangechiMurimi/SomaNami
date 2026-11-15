import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

/** What the learner picked: a fixed theme, or whatever the system uses. */
export type ThemePreference = Theme | 'system'

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

function savePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') window.localStorage.removeItem(THEME_KEY)
    else window.localStorage.setItem(THEME_KEY, preference)
  } catch {
    // Private browsing can refuse storage; the choice then lasts the session.
  }
}

/**
 * Light/dark theme: follows the system until the learner picks one, then
 * remembers that choice on this device. A fixed choice is applied as
 * `data-theme` on <html>; "system" removes the attribute so the CSS media
 * query in index.css tracks the OS live, with no listener needed here.
 */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    () => readSavedTheme() ?? 'system',
  )
  const theme: Theme = preference === 'system' ? systemTheme() : preference

  useEffect(() => {
    const root = document.documentElement
    if (preference === 'system') delete root.dataset.theme
    else root.dataset.theme = preference
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    savePreference(next)
    setPreferenceState(next)
  }, [])

  const toggle = useCallback(() => {
    setPreferenceState((current) => {
      const shown = current === 'system' ? systemTheme() : current
      const next = shown === 'dark' ? 'light' : 'dark'
      savePreference(next)
      return next
    })
  }, [])

  return { theme, preference, setPreference, toggle }
}
