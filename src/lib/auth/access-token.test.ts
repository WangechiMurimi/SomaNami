import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAccessToken } from './access-token.ts'
import { setSupabaseClient } from './supabase-client.ts'

const session = (token: string) => ({
  data: { session: { access_token: token } },
  error: null,
})

function fakeClient() {
  const auth = {
    getSession: vi.fn().mockResolvedValue(session('current')),
    refreshSession: vi.fn().mockResolvedValue(session('fresh')),
  }
  setSupabaseClient({ auth } as unknown as SupabaseClient)
  return auth
}

afterEach(() => setSupabaseClient(undefined))

describe('getAccessToken', () => {
  it('is null when Supabase is not configured', async () => {
    setSupabaseClient(null)
    await expect(getAccessToken()).resolves.toBeNull()
  })

  it('returns the current session token', async () => {
    const auth = fakeClient()
    await expect(getAccessToken()).resolves.toBe('current')
    expect(auth.refreshSession).not.toHaveBeenCalled()
  })

  it('forces a new token when asked to refresh', async () => {
    fakeClient()
    await expect(getAccessToken({ refresh: true })).resolves.toBe('fresh')
  })

  it('is null when there is no session', async () => {
    const auth = fakeClient()
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(getAccessToken()).resolves.toBeNull()
  })
})
