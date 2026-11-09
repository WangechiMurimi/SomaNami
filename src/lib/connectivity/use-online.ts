import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

const getSnapshot = () => navigator.onLine
// Rendering without a browser (tests, prerender) assumes a connection.
const getServerSnapshot = () => true

/**
 * Whether the browser believes it is online. `navigator.onLine` can report
 * true on a network with no internet, so treat `false` as certain and `true`
 * as "probably"; the chat route still handles failed requests itself.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
