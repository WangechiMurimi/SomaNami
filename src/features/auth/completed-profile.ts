// The user whose profile this device last saw complete. It lets the app open
// without a profile round trip on every load, and keeps a flaky connection
// from sending a returning learner back to the details step. Only the user id
// is kept, which Supabase already stores on this device.
const KEY = 'somanami-profile-complete'

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Whether this device already saw the user's profile complete. */
export function hasCompletedProfile(userId: string): boolean {
  try {
    return storage()?.getItem(KEY) === userId
  } catch {
    return false
  }
}

/** Records that the user's profile is complete. */
export function rememberCompletedProfile(userId: string): void {
  try {
    storage()?.setItem(KEY, userId)
  } catch {
    // Storage full or blocked: the gate just checks the server next time.
  }
}

/** Forgets the record; called on every sign-out. */
export function forgetCompletedProfile(): void {
  try {
    storage()?.removeItem(KEY)
  } catch {
    // Nothing to forget.
  }
}
