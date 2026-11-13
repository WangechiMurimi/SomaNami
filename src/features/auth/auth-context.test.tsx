import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AuthProvider from './AuthProvider.tsx'
import { useAuth } from './auth-context.ts'

describe('useAuth', () => {
  it('throws outside an AuthProvider, so a missing provider fails loudly', () => {
    expect(() => renderHook(() => useAuth())).toThrow(/inside <AuthProvider>/)
  })

  it('returns the session inside an AuthProvider', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    expect(result.current.status).toBe('signed-in')
  })
})
