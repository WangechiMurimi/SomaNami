import { createContext, useContext } from 'react'
import type { AuthContextValue } from '../../types/auth.ts'

export const AuthContext = createContext<AuthContextValue | null>(null)

/** The visitor's session and account actions, from the nearest `AuthProvider`. */
export function useAuth(): AuthContextValue {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}
