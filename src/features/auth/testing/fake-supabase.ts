import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from '@supabase/supabase-js'
import { vi } from 'vitest'
import { setSupabaseClient } from '../../../lib/auth/supabase-client.ts'

type Listener = (event: AuthChangeEvent, session: Session | null) => void

export interface FakeUser {
  id?: string
  email?: string
}

/** A session shaped like Supabase's, for tests. Holds no real token. */
export function fakeSession({
  id = 'user-1',
  email = 'learner@example.com',
}: FakeUser = {}): Session {
  return {
    access_token: `token-${id}`,
    refresh_token: `refresh-${id}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id,
      email,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    },
  } as Session
}

const ok = <T>(data: T) => Promise.resolve({ data, error: null })

/**
 * An in-memory stand-in for `supabase.auth`, installed with
 * `setSupabaseClient`. Every method is a `vi.fn`, so tests can override one
 * call (`auth.signInWithPassword.mockResolvedValueOnce(...)`) or inspect args.
 */
export function installFakeSupabase({
  session = null,
}: { session?: Session | null } = {}) {
  const listeners = new Set<Listener>()
  const state = { session }

  const emit = (event: AuthChangeEvent, next: Session | null) => {
    state.session = next
    for (const listener of listeners) listener(event, next)
  }

  const auth = {
    getSession: vi.fn(() => ok({ session: state.session })),
    refreshSession: vi.fn(() => ok({ session: state.session })),
    onAuthStateChange: vi.fn((listener: Listener) => {
      listeners.add(listener)
      return {
        data: {
          subscription: { unsubscribe: () => listeners.delete(listener) },
        },
      }
    }),
    signInWithPassword: vi.fn(async () => {
      const next = fakeSession()
      emit('SIGNED_IN', next)
      return { data: { session: next, user: next.user }, error: null }
    }),
    signUp: vi.fn(() => ok({ session: null, user: null })),
    signOut: vi.fn(async () => {
      emit('SIGNED_OUT', null)
      return { error: null }
    }),
    resetPasswordForEmail: vi.fn(() => ok({})),
    updateUser: vi.fn(() => ok({ user: state.session?.user ?? null })),
  }

  setSupabaseClient({ auth } as unknown as SupabaseClient)
  return { auth, emit, state }
}
