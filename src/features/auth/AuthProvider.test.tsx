import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSupabaseClient } from '../../lib/auth/supabase-client.ts'
import AuthProvider from './AuthProvider.tsx'
import { useAuth } from './auth-context.ts'
import { readLastUser, writeLastUser } from './last-user.ts'
import { fakeSession, installFakeSupabase } from './testing/fake-supabase.ts'

const renderAuth = () => renderHook(() => useAuth(), { wrapper: AuthProvider })

const setOnline = (online: boolean) => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)
  window.dispatchEvent(new Event(online ? 'online' : 'offline'))
}

const offlineError = () => new AuthRetryableFetchError('Failed to fetch', 0)
const SIGN_IN = { email: 'a@example.com', password: 'pw', captchaToken: 'tok' }

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  setSupabaseClient(undefined)
})

describe('restoring a session', () => {
  it('starts loading, then restores a saved session', async () => {
    installFakeSupabase({ session: fakeSession({ email: 'me@example.com' }) })
    const { result } = renderAuth()
    expect(result.current.status).toBe('loading')

    await waitFor(() => expect(result.current.status).toBe('signed-in'))
    expect(result.current.user).toEqual({
      id: 'user-1',
      email: 'me@example.com',
    })
    expect(readLastUser()).toEqual({ id: 'user-1', email: 'me@example.com' })
  })

  it('is signed out with no saved session', async () => {
    installFakeSupabase()
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-out'))
    expect(result.current.user).toBeNull()
  })

  it('stays signed in offline when an expired token cannot be refreshed', async () => {
    const { auth } = installFakeSupabase()
    writeLastUser({ id: 'user-1', email: 'me@example.com' })
    // Every attempt fails: the browser may claim to be online on a dead network.
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: offlineError(),
    } as never)

    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-in-offline'))
    expect(result.current.user?.email).toBe('me@example.com')
  })

  it('recovers to signed-in when the connection returns', async () => {
    const { auth } = installFakeSupabase({ session: fakeSession() })
    writeLastUser({ id: 'user-1', email: 'learner@example.com' })
    auth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: offlineError(),
    } as never)
    setOnline(false)
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-in-offline'))

    act(() => setOnline(true))
    await waitFor(() => expect(result.current.status).toBe('signed-in'))
  })

  it('signs out when the refresh token is rejected', async () => {
    const { auth } = installFakeSupabase()
    writeLastUser({ id: 'user-1', email: 'me@example.com' })
    auth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthApiError(
        'Invalid Refresh Token',
        400,
        'refresh_token_not_found',
      ),
    } as never)

    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-out'))
    expect(readLastUser()).toBeNull()
  })

  it('reports signed-in-offline while the browser is offline', async () => {
    installFakeSupabase({ session: fakeSession() })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-in'))

    act(() => setOnline(false))
    expect(result.current.status).toBe('signed-in-offline')
  })
})

describe('network errors never sign the user out', () => {
  it('keeps the session when a sign-in attempt fails offline', async () => {
    const { auth } = installFakeSupabase({ session: fakeSession() })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-in'))

    auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: offlineError(),
    } as never)
    let outcome
    await act(async () => {
      outcome = await result.current.signIn(SIGN_IN)
    })
    expect(outcome).toEqual({ ok: false, error: 'offline' })
    expect(result.current.status).toBe('signed-in')
  })

  it('keeps the session when a refresh fails with a network error', async () => {
    const { emit } = installFakeSupabase({ session: fakeSession() })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-in'))

    // supabase-js emits nothing on a retryable failure; only SIGNED_OUT ends a session.
    act(() => emit('TOKEN_REFRESHED', fakeSession()))
    await waitFor(() => expect(result.current.status).toBe('signed-in'))
  })

  it('signs out on SIGNED_OUT', async () => {
    const { emit } = installFakeSupabase({ session: fakeSession() })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-in'))

    act(() => emit('SIGNED_OUT', null))
    expect(result.current.status).toBe('signed-out')
    expect(readLastUser()).toBeNull()
  })
})

describe('MFA', () => {
  it('needs a code when the account has a verified authenticator', async () => {
    installFakeSupabase({ session: fakeSession({ mfa: true }) })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('needs-mfa'))
    expect(result.current.user).not.toBeNull()
    // Half-signed-in users can't come back offline without the code.
    expect(readLastUser()).toBeNull()
  })

  it('is signed in once the code is verified', async () => {
    const { auth } = installFakeSupabase({
      session: fakeSession({ mfa: true }),
    })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('needs-mfa'))

    await act(async () => {
      await result.current.mfa.verify('factor-1', '123456')
    })
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'factor-1',
      code: '123456',
    })
    await waitFor(() => expect(result.current.status).toBe('signed-in'))
  })

  it('maps a wrong code', async () => {
    const { auth } = installFakeSupabase({
      session: fakeSession({ mfa: true }),
    })
    auth.mfa.challengeAndVerify.mockResolvedValueOnce({
      data: null,
      error: new AuthApiError('bad', 422, 'mfa_verification_failed'),
    } as never)
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('needs-mfa'))

    await expect(
      result.current.mfa.verify('factor-1', '000000'),
    ).resolves.toEqual({ ok: false, error: 'invalid-code' })
  })

  it('wraps listing, enrolling and removing factors', async () => {
    const { auth } = installFakeSupabase({
      session: fakeSession({ mfa: true }),
      aal: 'aal2',
    })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-in'))

    await expect(result.current.mfa.listFactors()).resolves.toEqual([
      { id: 'factor-1', friendlyName: null, status: 'verified' },
    ])
    await expect(result.current.mfa.enrollTotp('Phone')).resolves.toEqual({
      factorId: 'factor-2',
      qrCode: 'data:image/svg+xml;utf-8,<svg/>',
      secret: 'SECRET',
    })
    expect(auth.mfa.enroll).toHaveBeenCalledWith({
      factorType: 'totp',
      friendlyName: 'Phone',
    })
    await expect(result.current.mfa.unenroll('factor-1')).resolves.toEqual({
      ok: true,
    })
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'factor-1' })
  })
})

describe('account actions', () => {
  it('signs in with the captcha token and maps bad credentials', async () => {
    const { auth } = installFakeSupabase()
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-out'))

    auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: new AuthApiError(
        'Invalid login credentials',
        400,
        'invalid_credentials',
      ),
    } as never)
    await expect(result.current.signIn(SIGN_IN)).resolves.toEqual({
      ok: false,
      error: 'invalid-credentials',
    })
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'pw',
      options: { captchaToken: 'tok' },
    })

    await act(async () => {
      await result.current.signIn(SIGN_IN)
    })
    expect(result.current.status).toBe('signed-in')
  })

  it('signs up with only the age outcome and consent time', async () => {
    const { auth } = installFakeSupabase()
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-out'))

    await expect(
      result.current.signUp({
        ...SIGN_IN,
        consentedAt: '2026-11-13T00:00:00Z',
      }),
    ).resolves.toEqual({ ok: true })
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'pw',
      options: {
        captchaToken: 'tok',
        emailRedirectTo: `${window.location.origin}/sign-in`,
        data: { age_13_plus: true, consented_at: '2026-11-13T00:00:00Z' },
      },
    })
  })

  it('does not reveal that an email is already registered on sign-up', async () => {
    const { auth } = installFakeSupabase()
    auth.signUp.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: new AuthApiError(
        'User already registered',
        422,
        'user_already_exists',
      ),
    } as never)
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-out'))

    await expect(
      result.current.signUp({ ...SIGN_IN, consentedAt: 'now' }),
    ).resolves.toEqual({ ok: true })
  })

  it('reports password reset as sent whether or not the account exists', async () => {
    const { auth } = installFakeSupabase()
    auth.resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: new AuthApiError('User not found', 400, 'user_not_found'),
    } as never)
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-out'))

    const input = { email: 'a@example.com', captchaToken: 'tok' }
    await expect(result.current.requestPasswordReset(input)).resolves.toEqual({
      ok: true,
    })
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@example.com', {
      captchaToken: 'tok',
      redirectTo: `${window.location.origin}/update-password`,
    })

    auth.resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: new AuthApiError('captcha', 400, 'captcha_failed'),
    } as never)
    await expect(result.current.requestPasswordReset(input)).resolves.toEqual({
      ok: false,
      error: 'captcha-failed',
    })
  })

  it('updates the password', async () => {
    const { auth } = installFakeSupabase({ session: fakeSession() })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-in'))

    await expect(
      result.current.updatePassword('new-pass-123'),
    ).resolves.toEqual({
      ok: true,
    })
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-pass-123' })
  })

  it('signs out of this device only by default', async () => {
    const { auth } = installFakeSupabase({ session: fakeSession() })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-in'))

    await act(() => result.current.signOut())
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(result.current.status).toBe('signed-out')
  })

  it('still signs this device out when a global sign-out fails offline', async () => {
    const { auth } = installFakeSupabase({ session: fakeSession() })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-in'))

    auth.signOut.mockResolvedValueOnce({ error: offlineError() } as never)
    await act(() => result.current.signOut({ scope: 'global' }))
    expect(auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' })
    expect(result.current.status).toBe('signed-out')
  })
})

describe('without a Supabase project', () => {
  it('is signed out and every action reports not-configured', async () => {
    setSupabaseClient(null)
    const { result } = renderAuth()
    expect(result.current.status).toBe('signed-out')

    const notConfigured = { ok: false, error: 'not-configured' }
    await expect(result.current.signIn(SIGN_IN)).resolves.toEqual(notConfigured)
    await expect(
      result.current.signUp({ ...SIGN_IN, consentedAt: 'now' }),
    ).resolves.toEqual(notConfigured)
    await expect(
      result.current.requestPasswordReset({ email: 'a', captchaToken: 't' }),
    ).resolves.toEqual(notConfigured)
    await expect(result.current.updatePassword('x')).resolves.toEqual(
      notConfigured,
    )
    await expect(result.current.mfa.verify('f', '1')).resolves.toEqual(
      notConfigured,
    )
    await expect(result.current.mfa.listFactors()).resolves.toEqual([])
    await expect(result.current.mfa.enrollTotp()).rejects.toThrow()
  })
})
