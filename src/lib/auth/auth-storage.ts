// Only the "Keep me signed in" choice is ours to store; Supabase writes the
// session itself, through `authStorage` below.
const KEEP_SIGNED_IN_KEY = 'somanami-keep-signed-in'

type StoreName = 'localStorage' | 'sessionStorage'

/** The named Web Storage, or `null` when the browser blocks it. */
function store(name: StoreName): Storage | null {
  try {
    return window[name]
  } catch {
    // Accessing storage throws when site data is blocked (privacy settings).
    return null
  }
}

/** Whether the visitor chose to stay signed in after the browser closes. Defaults to yes. */
export function readKeepSignedIn(): boolean {
  try {
    return store('localStorage')?.getItem(KEEP_SIGNED_IN_KEY) !== 'false'
  } catch {
    return true
  }
}

/** Remembers the choice; call it before signing in so the session lands in the right store. */
export function setKeepSignedIn(keep: boolean): void {
  try {
    store('localStorage')?.setItem(KEEP_SIGNED_IN_KEY, String(keep))
  } catch {
    // Quota or blocked storage: the default (stay signed in) applies.
  }
}

const preferred = (): StoreName =>
  readKeepSignedIn() ? 'localStorage' : 'sessionStorage'
const other = (name: StoreName): StoreName =>
  name === 'localStorage' ? 'sessionStorage' : 'localStorage'

function safely<T>(fallback: T, run: () => T): T {
  try {
    return run()
  } catch {
    return fallback
  }
}

/**
 * Session storage for supabase-js. With "Keep me signed in" off, the session
 * lives in sessionStorage, so the browser ends it on close; otherwise in
 * localStorage. Writes also clear the other store, so switching the choice
 * never leaves an old session behind to be picked up later.
 */
export const authStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> =
  {
    getItem(key) {
      return safely(null, () => store(preferred())?.getItem(key) ?? null)
    },
    setItem(key, value) {
      const target = preferred()
      safely(undefined, () => store(target)?.setItem(key, value))
      safely(undefined, () => store(other(target))?.removeItem(key))
    },
    removeItem(key) {
      safely(undefined, () => store('localStorage')?.removeItem(key))
      safely(undefined, () => store('sessionStorage')?.removeItem(key))
    },
  }
