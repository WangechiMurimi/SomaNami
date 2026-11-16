import { useState } from 'react'

export const SIDEBAR_KEY = 'somanami-sidebar'

/** Whether the learner last left the sidebar collapsed; storage may be blocked. */
export function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === 'collapsed'
  } catch {
    return false
  }
}

function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) window.localStorage.setItem(SIDEBAR_KEY, 'collapsed')
    else window.localStorage.removeItem(SIDEBAR_KEY)
  } catch {
    // Private browsing can refuse storage; the choice then lasts the session.
  }
}

/**
 * The wide-screen sidebar's collapsed state, remembered across sessions so
 * the app reopens the way the learner left it. Defaults to expanded.
 */
export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed)
  const update = (next: boolean) => {
    setCollapsed(next)
    writeSidebarCollapsed(next)
  }
  return [collapsed, update]
}
