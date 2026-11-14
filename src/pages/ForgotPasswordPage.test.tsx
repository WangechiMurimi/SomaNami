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
import ForgotPasswordPage from './ForgotPasswordPage.tsx'

const page = () =>
  renderAt(
    '/forgot-password',
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />,
  )

const submit = async (email: string) => {
  await userEvent.type(await screen.findByLabelText('Email'), email)
  await userEvent.click(
    screen.getByRole('button', { name: 'Email me a reset link' }),
  )
}

const SENT = /If an account exists for that email, we’ve emailed it a link/

beforeEach(() => resetTurnstileLoader())
afterEach(() => {
  setSupabaseClient(undefined)
  vi.unstubAllEnvs()
  delete window.turnstile
})

describe('ForgotPasswordPage', () => {
  it('uses email autocomplete', async () => {
    installFakeSupabase()
    page()
    expect(await screen.findByLabelText('Email')).toHaveAttribute(
      'autocomplete',
      'email',
    )
  })

  it('sends the captcha token and shows the non-enumerating message', async () => {
    const { auth } = installFakeSupabase()
    installFakeTurnstile()
    page()
    await submit('me@example.com')

    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'me@example.com',
      expect.objectContaining({ captchaToken: 'captcha-1' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(SENT)
  })

  it('shows the same message when no account exists', async () => {
    const { auth } = installFakeSupabase()
    auth.resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: new AuthApiError('User not found', 400, 'user_not_found'),
    } as never)
    page()
    await submit('nobody@example.com')
    expect(await screen.findByRole('status')).toHaveTextContent(SENT)
  })

  it('shows problems that say nothing about the account', async () => {
    const { auth } = installFakeSupabase()
    auth.resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: new AuthApiError('slow down', 429, 'over_email_send_rate_limit'),
    } as never)
    page()
    await submit('me@example.com')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts',
    )
  })

  it('asks for an email first', async () => {
    const { auth } = installFakeSupabase()
    page()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Email me a reset link' }),
    )
    expect(screen.getByLabelText('Email')).toHaveFocus()
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })
})
