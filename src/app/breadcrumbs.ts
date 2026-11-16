import { createContext, useContext, useEffect } from 'react'

/** One step in the top bar's trail; the last step is the current page. */
export interface Crumb {
  label: string
  /** Omit for the current page. */
  to?: string
}

type SetCrumbs = (crumbs: Crumb[]) => void

export const BreadcrumbContext = createContext<SetCrumbs>(() => {})

/**
 * Shows `crumbs` in the app shell's top bar while the calling page is mounted.
 * Pages outside the shell (tests, auth screens) get a no-op.
 */
export function useBreadcrumbs(crumbs: Crumb[]): void {
  const setCrumbs = useContext(BreadcrumbContext)
  // Serialised so callers can pass a fresh array literal every render.
  const key = JSON.stringify(crumbs)
  useEffect(() => {
    setCrumbs(JSON.parse(key) as Crumb[])
    return () => setCrumbs([])
  }, [key, setCrumbs])
}
