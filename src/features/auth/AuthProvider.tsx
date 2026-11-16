import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { getSupabaseClient } from '../../lib/auth/supabase-client.ts'
import { useOnline } from '../../lib/connectivity/use-online.ts'
import type {
  AuthContextValue,
  AuthResult,
  AuthStatus,
  AuthUser,
} from '../../types/auth.ts'
import { AuthContext } from './auth-context.ts'
import { toAuthErrorCode } from './auth-errors.ts'
import { forgetCompletedProfile } from './completed-profile.ts'
import { clearLastUser, readLastUser, writeLastUser } from './last-user.ts'

type Snapshot =
  | { phase: 'loading' }
  | { phase: 'signed-out' }
  | {
      phase: 'session'
      user: AuthUser
      /** The saved session couldn't be refreshed (offline at boot). */
      stale: boolean
    }

const SIGNED_OUT: Snapshot = { phase: 'signed-out' }
const OK: AuthResult = { ok: true }
const NOT_CONFIGURED: AuthResult = { ok: false, error: 'not-configured' }

const fail = (error: unknown): AuthResult => ({
  ok: false,
  error: toAuthErrorCode(error),
})

const toAuthUser = (session: Session): AuthUser => ({
  id: session.user.id,
  email: session.user.email ?? '',
})

const origin = () => window.location.origin

// A promise that never settles: drops a result whose effect was cleaned up.
const never = () => new Promise<never>(() => {})

/**
 * Keeps the previous snapshot (and its `user` object) when nothing visible
 * changed, so a token refresh doesn't re-render every `useAuth()` consumer or
 * look like a user switch to effects keyed on `user`.
 */
function keepUnchanged(prev: Snapshot, next: Snapshot): Snapshot {
  if (prev.phase !== 'session' || next.phase !== 'session') {
    return prev.phase === next.phase && prev.phase !== 'session' ? prev : next
  }
  const sameUser =
    prev.user.id === next.user.id && prev.user.email === next.user.email
  if (!sameUser) return next
  if (prev.stale === next.stale) return prev
  return { ...next, user: prev.user }
}

/** The snapshot for a live session. */
const snapshotFor = (session: Session): Snapshot => ({
  phase: 'session',
  user: toAuthUser(session),
  stale: false,
})

/**
 * The snapshot for whatever session this device has saved. supabase-js keeps
 * the session when a refresh fails for lack of network, but reports none, so a
 * network error falls back to the last fully signed-in user rather than
 * signing them out.
 */
async function restoreSnapshot(supabase: SupabaseClient): Promise<Snapshot> {
  const { data, error } = await supabase.auth.getSession()
  if (data.session) return snapshotFor(data.session)
  const lastUser = readLastUser()
  if (error && toAuthErrorCode(error) === 'offline' && lastUser) {
    return { phase: 'session', user: lastUser, stale: true }
  }
  return SIGNED_OUT
}

/** Provides the session and account actions to every screen. */
export default function AuthProvider({ children }: { children: ReactNode }) {
  // Read once: the client is a singleton, and tests swap it before rendering.
  const [supabase] = useState(getSupabaseClient)
  const online = useOnline()
  const [snapshot, setSnapshot] = useState<Snapshot>(() =>
    supabase ? { phase: 'loading' } : SIGNED_OUT,
  )

  // Bumped on every sign-out. A session check that started before it must
  // not land afterwards and sign the user back in.
  const generation = useRef(0)

  // The one place snapshots land, so the offline cache always matches state.
  const commit = useCallback((next: Snapshot) => {
    if (next.phase === 'signed-out') {
      clearLastUser()
      forgetCompletedProfile()
    }
    if (next.phase === 'session' && !next.stale) writeLastUser(next.user)
    setSnapshot((prev) => keepUnchanged(prev, next))
  }, [])

  const signedOut = useCallback(() => {
    generation.current += 1
    commit(SIGNED_OUT)
  }, [commit])

  /** Commits what `load` resolves to, unless a sign-out happened meanwhile. */
  const commitLater = useCallback(
    async (load: Promise<Snapshot>) => {
      const started = generation.current
      const next = await load
      if (started === generation.current) commit(next)
    },
    [commit],
  )

  const applySession = useCallback(
    (session: Session) => commit(snapshotFor(session)),
    [commit],
  )

  useEffect(() => {
    if (!supabase) return
    let active = true
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // The boot restore below handles the initial session.
      if (!active || event === 'INITIAL_SESSION') return
      if (event === 'SIGNED_OUT') {
        signedOut()
        return
      }
      // Supabase warns against awaiting its own calls inside this callback
      // (it holds a lock), so evaluate the session on the next tick.
      if (session) {
        setTimeout(() => {
          if (active) applySession(session)
        }, 0)
      }
    })
    void commitLater(
      restoreSnapshot(supabase).then((next) => (active ? next : never())),
    )
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [supabase, applySession, signedOut, commitLater])

  // Back online with a session we couldn't refresh: try again.
  const stale = snapshot.phase === 'session' && snapshot.stale
  useEffect(() => {
    if (!supabase || !online || !stale) return
    let active = true
    void commitLater(
      restoreSnapshot(supabase).then((next) => (active ? next : never())),
    )
    return () => {
      active = false
    }
  }, [supabase, online, stale, commitLater])

  const status: AuthStatus =
    snapshot.phase === 'loading'
      ? 'loading'
      : snapshot.phase === 'signed-out'
        ? 'signed-out'
        : online && !snapshot.stale
          ? 'signed-in'
          : 'signed-in-offline'

  const user = snapshot.phase === 'session' ? snapshot.user : null

  const value = useMemo<AuthContextValue>(() => {
    if (!supabase) return notConfiguredValue
    const auth = supabase.auth

    return {
      status,
      user,
      async signIn({ email, password, captchaToken }) {
        const { data, error } = await auth.signInWithPassword({
          email,
          password,
          options: { captchaToken },
        })
        if (error) return fail(error)
        // Update status before resolving, so the caller can navigate at once.
        if (data.session) applySession(data.session)
        return OK
      },
      async signUp({ email, password, captchaToken }) {
        const { error } = await auth.signUp({
          email,
          password,
          options: { captchaToken, emailRedirectTo: `${origin()}/sign-in` },
        })
        if (!error) return OK
        const code = toAuthErrorCode(error)
        // Answer as if the account were new, so sign-up can't be used to
        // test which emails are registered (Supabase does the same when
        // email confirmation is on).
        return code === 'email-in-use' ? OK : { ok: false, error: code }
      },
      async signOut({ scope = 'local' } = {}) {
        try {
          const { error } = await auth.signOut({ scope })
          // A failed global sign-out (often offline) must still sign this device out.
          if (error && scope === 'global') {
            await auth.signOut({ scope: 'local' })
          }
        } catch {
          // auth-js removes the local session before anything can throw here
          // (it rethrows listener errors afterwards), so there is nothing to undo.
        } finally {
          // Whatever Supabase reports, this screen must stop showing the user.
          signedOut()
        }
      },
      async requestPasswordReset({ email, captchaToken }) {
        const { error } = await auth.resetPasswordForEmail(email, {
          captchaToken,
          redirectTo: `${origin()}/update-password`,
        })
        if (!error) return OK
        const code = toAuthErrorCode(error)
        // Only errors that say nothing about the account reach the user.
        return code === 'captcha-failed' ||
          code === 'rate-limited' ||
          code === 'offline'
          ? { ok: false, error: code }
          : OK
      },
      async updatePassword(password) {
        const { error } = await auth.updateUser({ password })
        return error ? fail(error) : OK
      },
    }
  }, [supabase, status, user, applySession, signedOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

const notReady = async (): Promise<AuthResult> => NOT_CONFIGURED

// Without a Supabase project nobody can sign in; the sign-in page explains why.
const notConfiguredValue: AuthContextValue = {
  status: 'signed-out',
  user: null,
  signIn: notReady,
  signUp: notReady,
  signOut: async () => {},
  requestPasswordReset: notReady,
  updatePassword: notReady,
}
