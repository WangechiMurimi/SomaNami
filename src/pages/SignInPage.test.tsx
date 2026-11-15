import { AuthApiError } from '@supabase/supabase-js'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSupabaseClient } from '../lib/auth/supabase-client.ts'
import {
  fakeSession,
  installFakeSupabase,
} from '../features/auth/testing/fake-supabase.ts'
import {
  installFakeTurnstile,
  redirectedTo,
  renderAt,
} from '../features/auth/testing/render-routes.tsx'
import { resetTurnstileLoader } from '../features/auth/turnstile-script.ts'
import SignInPage from './SignInPage.tsx'

const page = (path = '/sign-in') =>
  renderAt(path, <Route path="/sign-in" element={<SignInPage />} />)

const fillAndSubmit = async (email = 'me@example.com', password = 'pass') => {
  await userEvent.type(await screen.findByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

beforeEach(() => {
  window.localStorage.clear()
  resetTurnstileLoader()
})
afterEach(() => {
  setSupabaseClient(undefined)
  vi.unstubAllEnvs()
  delete window.turnstile
})

describe('SignInPage', () => {
  it('is a real form that password managers understand', async () => {
    installFakeSupabase()
    page()
    const email = await screen.findByLabelText('Email')
    expect(email).toHaveAttribute('type', 'email')
    expect(email).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'autocomplete',
      'current-password',
    )
    expect(email.closest('form')).not.toBeNull()
  })

  it('shows and hides the password', async () => {
    installFakeSupabase()
    page()
    const password = await screen.findByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('passes the captcha token and opens the requested page', async () => {
    const { auth } = installFakeSupabase()
    installFakeTurnstile()
    page('/sign-in?next=%2Flibrary')
    await fillAndSubmit()

    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'pass',
      options: { captchaToken: 'captcha-1' },
    })
    expect(await redirectedTo()).toBe('/library')
  })

  it.each(['//evil.example', 'https://evil.example', '/\\evil.example'])(
    'ignores an unsafe next of %s',
    async (next) => {
      installFakeSupabase()
      page(`/sign-in?next=${encodeURIComponent(next)}`)
      await fillAndSubmit()
      expect(await redirectedTo()).toBe('/')
    },
  )

  it('shows one message for any wrong email or password and resets the check', async () => {
    const { auth } = installFakeSupabase()
    const turnstile = installFakeTurnstile()
    auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: new AuthApiError('x', 400, 'invalid_credentials'),
    } as never)
    page()
    await fillAndSubmit()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Invalid email or password.')
    expect(alert).toHaveFocus()
    expect(turnstile.reset).toHaveBeenCalled()

    // The next attempt uses the fresh token.
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(auth.signInWithPassword).toHaveBeenLastCalledWith(
      expect.objectContaining({ options: { captchaToken: 'captcha-2' } }),
    )
  })

  it('flags empty fields and focuses the first one', async () => {
    const { auth } = installFakeSupabase()
    page()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign in' }),
    )

    const email = screen.getByLabelText('Email')
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveFocus()
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('asks for the security check before sending', async () => {
    const { auth } = installFakeSupabase()
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key')
    window.turnstile = { render: () => 'w', reset: vi.fn(), remove: vi.fn() }
    page()
    await fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Complete the security check',
    )
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('goes to the code screen when the account has an authenticator', async () => {
    const { auth, state } = installFakeSupabase()
    auth.signInWithPassword.mockImplementationOnce(async () => {
      const session = fakeSession({ mfa: true })
      state.session = session
      return { data: { session, user: session.user }, error: null }
    })
    page('/sign-in?next=%2Flibrary')
    await fillAndSubmit()
    expect(await redirectedTo()).toBe('/sign-in/verify?next=%2Flibrary')
  })

  it('skips the form when already signed in', async () => {
    installFakeSupabase({ session: fakeSession() })
    page('/sign-in?next=%2Faccount')
    expect(await redirectedTo()).toBe('/account')
  })

  it('explains when sign-in is not set up', async () => {
    setSupabaseClient(null)
    page()
    expect(
      await screen.findByText(/isn’t set up on this copy of SomaNami yet/),
    ).toBeInTheDocument()
  })

  it('links to sign-up and password reset', async () => {
    installFakeSupabase()
    page()
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Forgot your password?' }),
      ).toHaveAttribute('href', '/forgot-password'),
    )
    expect(
      screen.getByRole('link', { name: 'Create an account' }),
    ).toHaveAttribute('href', '/sign-up')
  })
})
