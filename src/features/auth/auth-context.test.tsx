import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { setSupabaseClient } from '../../lib/auth/supabase-client.ts'
import AuthProvider from './AuthProvider.tsx'
import { useAuth } from './auth-context.ts'
import { fakeSession, installFakeSupabase } from './testing/fake-supabase.ts'

afterEach(() => setSupabaseClient(undefined))

describe('useAuth', () => {
  it('throws outside an AuthProvider, so a missing provider fails loudly', () => {
    expect(() => renderHook(() => useAuth())).toThrow(/inside <AuthProvider>/)
  })

  it('returns the session inside an AuthProvider', async () => {
    installFakeSupabase({ session: fakeSession() })
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.status).toBe('signed-in'))
  })
})
