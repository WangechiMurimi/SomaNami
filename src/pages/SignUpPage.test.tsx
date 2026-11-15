import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { setSupabaseClient } from '../lib/auth/supabase-client.ts'
import SignUpPage from './SignUpPage.tsx'

const page = () =>
  renderAt('/sign-up', <Route path="/sign-up" element={<SignUpPage />} />)

const fillAccount = async (password = 'long-enough-pw') => {
  await userEvent.type(await screen.findByLabelText('Email'), 'me@example.com')
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

beforeEach(() => resetTurnstileLoader())
afterEach(() => {
  vi.unstubAllEnvs()
  setSupabaseClient(undefined)
  delete window.turnstile
})

describe('sign-up', () => {
  it('asks for the account first, with no age or consent questions', async () => {
    installFakeSupabase()
    page()
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText(/born|13/i)).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'How your data is handled' }),
    ).toHaveAttribute('href', '/your-data')
  })

  it('offers Google as well as email', async () => {
    const { auth } = installFakeSupabase()
    page()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Continue with Google' }),
    )
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  })

  it('creates the account with only email, password and captcha', async () => {
    const { auth } = installFakeSupabase()
    installFakeTurnstile()
    page()
    await fillAccount()

    expect(auth.signUp).toHaveBeenCalledOnce()
    const [payload] = auth.signUp.mock.calls[0] as unknown as [
      { options: { data?: object; captchaToken: string } },
    ]
    expect(payload.options.data).toBeUndefined()
    expect(payload.options.captchaToken).toBe('captcha-1')
    expect(
      await screen.findByRole('heading', { name: 'Check your email' }),
    ).toBeInTheDocument()
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
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('moves on once a session exists, so the details step can open', async () => {
    installFakeSupabase({ session: fakeSession() })
    page()
    expect(await redirectedTo()).toBe('/')
  })
})
