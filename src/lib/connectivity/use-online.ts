import { useSyncExternalStore } from 'react'

/**
 * Calls `onChange` whenever the browser goes online or offline; returns the
 * unsubscribe function. For code outside React, such as sync.
 */
export function subscribeToConnectivity(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** Whether the browser believes it is online (see `useOnline` for the caveat). */
export const isOnline = (): boolean => navigator.onLine
// Rendering without a browser (tests, prerender) assumes a connection.
const getServerSnapshot = () => true

/**
 * Whether the browser believes it is online. `navigator.onLine` can report
 * true on a network with no internet, so treat `false` as certain and `true`
 * as "probably"; the chat route still handles failed requests itself.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeToConnectivity,
    isOnline,
    getServerSnapshot,
  )
}
