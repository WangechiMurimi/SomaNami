import { AuthApiError } from '@supabase/supabase-js'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeSupabase } from '../features/auth/testing/fake-supabase.ts'
import {
  installFakeTurnstile,
  renderAt,
} from '../features/auth/testing/render-routes.tsx'
import { resetTurnstileLoader } from '../features/auth/turnstile-script.ts'
import { setSupabaseClient } from '../lib/auth/supabase-client.ts'
import SignUpPage from './SignUpPage.tsx'

const page = () =>
  renderAt('/sign-up', <Route path="/sign-up" element={<SignUpPage />} />)

const fillAccount = async (password = 'long-enough-pw') => {
  await userEvent.type(await screen.findByLabelText('Email'), 'me@example.com')
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

const confirmDetails = async ({ age = true, agree = true } = {}) => {
  if (age) {
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'I’m 13 or older' }),
    )
  }
  if (agree) {
    await userEvent.click(
      screen.getByRole('checkbox', { name: /I agree to the Terms/ }),
    )
  }
}

beforeEach(() => {
  // Fake only the clock, so user-event and promises still run normally.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 13))
  window.localStorage.clear()
  resetTurnstileLoader()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  setSupabaseClient(undefined)
  delete window.turnstile
})

describe('step 1: account', () => {
  it('opens on Google, then email and password, with no age step', async () => {
    installFakeSupabase()
    page()
    expect(await screen.findByText('Step 1 of 2')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeInTheDocument()
    const google = screen.getByRole('button', { name: 'Continue with Google' })
    expect(
      google.compareDocumentPosition(screen.getByLabelText('Email')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.queryByLabelText(/month|year/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/born/i)).not.toBeInTheDocument()
  })

  it('uses new-password and email autocomplete, and checks the length', async () => {
    const { auth } = installFakeSupabase()
    page()
    expect(await screen.findByLabelText('Email')).toHaveAttribute(
      'autocomplete',
      'email',
    )
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('autocomplete', 'new-password')

    await fillAccount('short')
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(password).toHaveFocus()
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('links to sign in', async () => {
    installFakeSupabase()
    page()
    expect(
      await screen.findByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute('href', '/sign-in')
  })
})

describe('step 2: details', () => {
  it('requires confirming 13 or older, sending nothing', async () => {
    const { auth } = installFakeSupabase()
    installFakeTurnstile()
    page()
    await fillAccount()
    expect(await screen.findByText('Step 2 of 2')).toBeInTheDocument()
    await confirmDetails({ age: false })
    await userEvent.click(
      screen.getByRole('button', { name: 'Create account' }),
    )

    const box = screen.getByRole('checkbox', { name: 'I’m 13 or older' })
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box).toHaveFocus()
    expect(box).toHaveAccessibleDescription(
      'SomaNami is for learners 13 and older.',
    )
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('requires agreeing to the Terms and Privacy Notice', async () => {
    const { auth } = installFakeSupabase()
    page()
    await fillAccount()
    await confirmDetails({ agree: false })
    await userEvent.click(
      screen.getByRole('button', { name: 'Create account' }),
    )

    expect(auth.signUp).not.toHaveBeenCalled()
    const box = screen.getByRole('checkbox', { name: /I agree to the Terms/ })
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box).toHaveFocus()
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      '/terms',
    )
    expect(
      screen.getByRole('link', { name: 'Privacy Notice' }),
    ).toHaveAttribute('href', '/privacy')
  })

  it('sends only the age outcome and consent time', async () => {
    const { auth } = installFakeSupabase()
    installFakeTurnstile()
    page()
    await fillAccount()
    await confirmDetails()
    await userEvent.click(
      screen.getByRole('button', { name: 'Create account' }),
    )

    expect(auth.signUp).toHaveBeenCalledOnce()
    const [payload] = auth.signUp.mock.calls[0] as unknown as [
      {
        email: string
        options: { data: object; captchaToken: string }
      },
    ]
    expect(payload.email).toBe('me@example.com')
    expect(payload.options.data).toEqual({
      age_13_plus: true,
      consented_at: new Date(2026, 10, 13).toISOString(),
    })
    expect(payload.options.captchaToken).toBe('captcha-1')
    expect(
      await screen.findByRole('heading', { name: 'Check your email' }),
    ).toBeInTheDocument()
    expect(screen.getByText('me@example.com')).toBeInTheDocument()
  })

  it('shows a sign-up failure without leaving the step', async () => {
    const { auth } = installFakeSupabase()
    installFakeTurnstile()
    auth.signUp.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: new AuthApiError('weak', 422, 'weak_password'),
    } as never)
    page()
    await fillAccount()
    await confirmDetails()
    await userEvent.click(
      screen.getByRole('button', { name: 'Create account' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Choose a stronger password/,
    )
  })

  it('goes back to a filled-in first step', async () => {
    installFakeSupabase()
    page()
    await fillAccount()
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }))
    expect(screen.getByLabelText('Email')).toHaveValue('me@example.com')
    expect(screen.getByLabelText('Password')).toHaveValue('long-enough-pw')
  })

  it('makes no privacy or offline claims', async () => {
    installFakeSupabase()
    page()
    await fillAccount()
    await screen.findByText('Step 2 of 2')
    const main = screen.getByRole('main')
    expect(main).toHaveTextContent(/answers only from the sources you add/i)
    expect(main).not.toHaveTextContent(/private|offline|this device/i)
  })
})

describe('with Google', () => {
  it('asks for the 13+ confirmation before leaving for Google', async () => {
    const { auth } = installFakeSupabase()
    page()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Continue with Google' }),
    )
    expect(await screen.findByText('Step 2 of 2')).toBeInTheDocument()
    expect(auth.signInWithOAuth).not.toHaveBeenCalled()

    const submit = screen.getByRole('button', { name: 'Continue with Google' })
    await userEvent.click(submit)
    expect(auth.signInWithOAuth).not.toHaveBeenCalled()

    await confirmDetails()
    await userEvent.click(submit)
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('explains when Google sign-in cannot start', async () => {
    const { auth } = installFakeSupabase()
    auth.signInWithOAuth.mockResolvedValueOnce({
      data: { provider: 'google', url: null },
      error: new AuthApiError('Too many', 429, 'over_request_rate_limit'),
    } as never)
    page()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Continue with Google' }),
    )
    await confirmDetails()
    await userEvent.click(
      screen.getByRole('button', { name: 'Continue with Google' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts',
    )
  })
})
