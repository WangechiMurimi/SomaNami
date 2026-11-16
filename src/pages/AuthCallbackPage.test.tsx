import { AuthApiError } from '@supabase/supabase-js'
import { screen, waitFor } from '@testing-library/react'
import { Route } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import {
  fakeSession,
  installFakeSupabase,
} from '../features/auth/testing/fake-supabase.ts'
import {
  redirectedTo,
  renderAt,
} from '../features/auth/testing/render-routes.tsx'
import { setSupabaseClient } from '../lib/auth/supabase-client.ts'
import AuthCallbackPage from './AuthCallbackPage.tsx'

const page = (path: string) =>
  renderAt(path, <Route path="/auth/callback" element={<AuthCallbackPage />} />)

afterEach(() => setSupabaseClient(undefined))

describe('auth callback', () => {
  it('exchanges the code once, then opens a safe next', async () => {
    const { auth } = installFakeSupabase()
    page('/auth/callback?code=abc&next=%2Flibrary')
    expect(await redirectedTo()).toBe('/library')
    expect(auth.exchangeCodeForSession).toHaveBeenCalledOnce()
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc')
  })

  it('goes home when next is missing or unsafe', async () => {
    installFakeSupabase()
    page('/auth/callback?code=abc&next=%2F%2Fevil.example')
    expect(await redirectedTo()).toBe('/')
  })

  it('carries a recovery link on to the new-password page', async () => {
    installFakeSupabase()
    page('/auth/callback?code=abc&next=%2Fupdate-password')
    expect(await redirectedTo()).toBe('/update-password')
  })

  it('explains a cancelled Google sign-in without exchanging anything', async () => {
    const { auth } = installFakeSupabase()
    page('/auth/callback?error=access_denied&error_description=raw+server+text')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Google sign-in didn’t finish',
    )
    expect(screen.queryByText(/raw server text/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute(
      'href',
      '/sign-in',
    )
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('reads an expired email link from the fragment too', async () => {
    installFakeSupabase()
    page('/auth/callback#error=access_denied&error_code=otp_expired')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That link has expired',
    )
  })

  it('explains a code that can’t be exchanged here', async () => {
    const { auth } = installFakeSupabase()
    auth.exchangeCodeForSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: new AuthApiError('gone', 404, 'flow_state_not_found'),
    })
    page('/auth/callback?code=old')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'opened in a different browser',
    )
  })

  it('treats a visit without a code as an expired link', async () => {
    const { auth } = installFakeSupabase()
    page('/auth/callback')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That link has expired',
    )
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('sends someone already signed in straight on', async () => {
    installFakeSupabase({ session: fakeSession() })
    page('/auth/callback?next=%2Faccount')
    expect(await redirectedTo()).toBe('/account')
  })

  it('waits for the saved session before exchanging', async () => {
    const { auth } = installFakeSupabase()
    page('/auth/callback?code=abc')
    expect(screen.getByRole('status')).toHaveTextContent('One moment')
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(auth.exchangeCodeForSession).toHaveBeenCalledOnce(),
    )
  })
})
