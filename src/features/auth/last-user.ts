import type { AuthUser } from '../../types/auth.ts'

// The account that last *fully* signed in here (MFA included). Offline, an
// expired access token can't be refreshed and supabase-js reports no session
// even though it keeps the refresh token; this lets the user keep reading their
// own materials (US-07). It holds only the id and email Supabase already
// stores on this device, never a token.
const KEY = 'somanami-last-user'

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** The last fully signed-in user on this device, if any. */
export function readLastUser(): AuthUser | null {
  try {
    const raw = storage()?.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'id' in parsed &&
      'email' in parsed &&
      typeof parsed.id === 'string' &&
      typeof parsed.email === 'string'
    ) {
      return { id: parsed.id, email: parsed.email }
    }
  } catch {
    // Corrupt value: treat as absent.
  }
  return null
}

/** Remembers the fully signed-in user for offline restarts. */
export function writeLastUser(user: AuthUser): void {
  storage()?.setItem(KEY, JSON.stringify({ id: user.id, email: user.email }))
}

/** Forgets the user; called on every sign-out. */
export function clearLastUser(): void {
  storage()?.removeItem(KEY)
}
