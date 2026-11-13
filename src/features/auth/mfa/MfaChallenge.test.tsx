import { AuthApiError } from '@supabase/supabase-js'
import type { Factor } from '@supabase/supabase-js'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setSupabaseClient } from '../../../lib/auth/supabase-client.ts'
import { fakeSession, installFakeSupabase } from '../testing/fake-supabase.ts'
import { redirectedTo, renderAt } from '../testing/render-routes.tsx'
import MfaChallenge from './MfaChallenge.tsx'

const page = (path = '/sign-in/verify') =>
  renderAt(path, <Route path="/sign-in/verify" element={<MfaChallenge />} />)

// Cast: the fake's mocks are typed by their success results.
const wrongCode = () =>
  ({
    data: null,
    error: new AuthApiError(
      'Invalid TOTP code entered',
      422,
      'mfa_verification_failed',
    ),
  }) as never

const totp = (id: string, friendlyName: string): Factor =>
  ({
    id,
    friendly_name: friendlyName,
    factor_type: 'totp',
    status: 'verified',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }) as Factor

const codeInput = () => screen.findByLabelText('6-digit code')

const submitCode = async (code: string) => {
  await userEvent.type(await codeInput(), code)
  await userEvent.click(screen.getByRole('button', { name: 'Verify' }))
}

beforeEach(() => window.localStorage.clear())
afterEach(() => setSupabaseClient(undefined))

describe('MfaChallenge', () => {
  it('is a one-time-code field phones can autofill, focused on arrival', async () => {
    installFakeSupabase({ session: fakeSession({ mfa: true }) })
    page()
    const input = await codeInput()
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAttribute('autocomplete', 'one-time-code')
    expect(input.closest('form')).not.toBeNull()
    await waitFor(() => expect(input).toHaveFocus())
    expect(
      screen.getByRole('heading', { level: 1, name: 'Enter your code' }),
    ).toBeInTheDocument()
  })

  it('verifies the code and opens the requested page', async () => {
    const { auth } = installFakeSupabase({
      session: fakeSession({ mfa: true }),
    })
    page('/sign-in/verify?next=%2Flibrary')
    await submitCode('123 456')

    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'factor-1',
      code: '123456',
    })
    expect(await redirectedTo()).toBe('/library')
  })

  it.each(['%2F%2Fevil.example', 'https%3A%2F%2Fevil.example', '%2Fsign-in'])(
    'goes home instead of an unsafe next of %s',
    async (next) => {
      installFakeSupabase({ session: fakeSession({ mfa: true }) })
      page(`/sign-in/verify?next=${next}`)
      await submitCode('123456')
      expect(await redirectedTo()).toBe('/')
    },
  )

  it('explains a wrong code and lets the user try again', async () => {
    const { auth } = installFakeSupabase({
      session: fakeSession({ mfa: true }),
    })
    auth.mfa.challengeAndVerify.mockResolvedValueOnce(wrongCode())
    page()
    await submitCode('000000')

    const input = await codeInput()
    expect(await screen.findByText(/That code didn’t work/)).toBeVisible()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/That code didn’t work/)
    expect(input).toHaveValue('')
    await waitFor(() => expect(input).toHaveFocus())

    await submitCode('123456')
    expect(await redirectedTo()).toBe('/')
  })

  it('checks the code is 6 digits before sending it', async () => {
    const { auth } = installFakeSupabase({
      session: fakeSession({ mfa: true }),
    })
    page()
    await userEvent.click(await screen.findByRole('button', { name: 'Verify' }))
    expect(
      await screen.findByText('Enter the 6-digit code from your app.'),
    ).toBeVisible()

    await submitCode('12a4')
    expect(
      await screen.findByText('The code is 6 digits, like 123 456.'),
    ).toBeVisible()
    expect(auth.mfa.challengeAndVerify).not.toHaveBeenCalled()
  })

  it('asks which authenticator when the account has a backup', async () => {
    const session = fakeSession({ mfa: true })
    session.user.factors = [totp('phone', 'Phone'), totp('tablet', 'Tablet')]
    const { auth } = installFakeSupabase({ session })
    page()

    const group = await screen.findByRole('radiogroup', {
      name: 'Authenticator',
    })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Phone' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Tablet' }))
    await submitCode('123456')

    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'tablet',
      code: '123456',
    })
  })

  it('signs out to use a different account', async () => {
    const { auth } = installFakeSupabase({
      session: fakeSession({ mfa: true }),
    })
    page('/sign-in/verify?next=%2Flibrary')
    await userEvent.click(
      await screen.findByRole('button', { name: 'Use a different account' }),
    )
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(await redirectedTo()).toBe('/sign-in?next=%2Flibrary')
  })

  it('sends signed-out visitors to sign in', async () => {
    installFakeSupabase()
    page('/sign-in/verify?next=%2Flibrary')
    expect(await redirectedTo()).toBe('/sign-in?next=%2Flibrary')
  })

  it('sends a fully signed-in user straight on', async () => {
    installFakeSupabase({ session: fakeSession() })
    page('/sign-in/verify?next=%2Flibrary')
    expect(await redirectedTo()).toBe('/library')
  })

  it('reports a failure to load the authenticators', async () => {
    const { auth } = installFakeSupabase({
      session: fakeSession({ mfa: true }),
    })
    auth.mfa.listFactors.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    page()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You’re offline. Reconnect, then try again.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await codeInput()).toBeInTheDocument()
  })
})
