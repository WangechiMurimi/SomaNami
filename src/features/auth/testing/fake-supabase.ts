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
  /** True when the account has a verified authenticator. */
  mfa?: boolean
}

/** A session shaped like Supabase's, for tests. Holds no real token. */
export function fakeSession({
  id = 'user-1',
  email = 'learner@example.com',
  mfa = false,
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
      factors: mfa
        ? [
            {
              id: 'factor-1',
              factor_type: 'totp',
              status: 'verified',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ]
        : [],
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
  aal = 'aal1',
}: { session?: Session | null; aal?: 'aal1' | 'aal2' } = {}) {
  const listeners = new Set<Listener>()
  const state = { session, aal }

  const emit = (event: AuthChangeEvent, next: Session | null) => {
    state.session = next
    for (const listener of listeners) listener(event, next)
  }

  const hasVerifiedFactor = () =>
    state.session?.user.factors?.some((f) => f.status === 'verified') ?? false

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
    mfa: {
      getAuthenticatorAssuranceLevel: vi.fn(() =>
        ok({
          currentLevel: state.session ? state.aal : null,
          nextLevel: state.session
            ? hasVerifiedFactor()
              ? 'aal2'
              : state.aal
            : null,
          currentAuthenticationMethods: [],
        }),
      ),
      listFactors: vi.fn(() => {
        const all = state.session?.user.factors ?? []
        return ok({ all, totp: all, phone: [], webauthn: [] })
      }),
      enroll: vi.fn(() =>
        ok({
          id: 'factor-2',
          type: 'totp',
          friendly_name: 'Phone',
          totp: { qr_code: '<svg/>', secret: 'SECRET', uri: 'otpauth://x' },
        }),
      ),
      challengeAndVerify: vi.fn(async () => {
        state.aal = 'aal2'
        emit('MFA_CHALLENGE_VERIFIED', state.session)
        return { data: {}, error: null }
      }),
      unenroll: vi.fn(() => ok({ id: 'factor-1' })),
    },
  }

  setSupabaseClient({ auth } as unknown as SupabaseClient)
  return { auth, emit, state }
}
