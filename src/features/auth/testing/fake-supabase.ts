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

/** A `profiles` row as PostgREST returns it. */
export interface FakeProfileRow {
  display_name: string | null
  age_13_plus: boolean
}

/** A finished details step, so signed-in screens open straight away. */
export const COMPLETE_PROFILE: FakeProfileRow = {
  display_name: 'Learner',
  age_13_plus: true,
}

/**
 * An in-memory stand-in for `supabase.auth` and the `profiles` table,
 * installed with `setSupabaseClient`. Every method is a `vi.fn`, so tests can
 * override one call (`auth.signInWithPassword.mockResolvedValueOnce(...)`) or
 * inspect args. `profile` is every user's row until one is saved; pass `null`
 * for an account that hasn't finished the details step.
 */
export function installFakeSupabase({
  session = null,
  profile = COMPLETE_PROFILE,
}: { session?: Session | null; profile?: FakeProfileRow | null } = {}) {
  const listeners = new Set<Listener>()
  const state = {
    session,
    profiles: new Map<string, FakeProfileRow | null>(),
  }
  const rowFor = (id: string) =>
    state.profiles.has(id) ? (state.profiles.get(id) ?? null) : profile

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

  // Only the query shapes src/lib/auth/profile.ts uses; tests stub `db`.
  const db = {
    readProfile: vi.fn(
      async (
        id: string,
      ): Promise<{ data: FakeProfileRow | null; error: Error | null }> => ({
        data: rowFor(id),
        error: null,
      }),
    ),
    upsertProfile: vi.fn(
      async (
        row: FakeProfileRow & { id: string },
      ): Promise<{ error: Error | null }> => {
        const { id, ...rest } = row
        state.profiles.set(id, rest)
        return { error: null }
      },
    ),
  }

  const from = vi.fn((table: string) => {
    if (table !== 'profiles') throw new Error(`No fake for table ${table}`)
    return {
      select: () => ({
        eq: (_column: 'id', id: string) => ({
          maybeSingle: () => db.readProfile(id),
        }),
      }),
      upsert: (row: FakeProfileRow & { id: string }) => db.upsertProfile(row),
    }
  })

  setSupabaseClient({ auth, from } as unknown as SupabaseClient)
  return { auth, db, emit, state }
}
