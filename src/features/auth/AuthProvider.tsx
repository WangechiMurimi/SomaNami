import type { ReactNode } from 'react'
import type { AuthContextValue, AuthResult } from '../../types/auth.ts'
import { AuthContext } from './auth-context.ts'

const notReady = async (): Promise<AuthResult> => ({
  ok: false,
  error: 'not-configured',
})

// TODO(#114): WS-B replaces this placeholder with the Supabase-backed provider.
// Until then everyone is "signed in" as one local user, so the app behaves
// exactly as it did before accounts existed.
const PLACEHOLDER: AuthContextValue = {
  status: 'signed-in',
  user: { id: 'local', email: '' },
  signIn: notReady,
  signUp: notReady,
  signOut: async () => {},
  requestPasswordReset: notReady,
  updatePassword: notReady,
  mfa: {
    listFactors: async () => [],
    enrollTotp: () => Promise.reject(new Error('MFA is not available yet')),
    verify: notReady,
    unenroll: notReady,
  },
}

/** Provides the session to every screen. */
export default function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={PLACEHOLDER}>{children}</AuthContext.Provider>
  )
}
