import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAgeBlock } from '../features/auth/age-gate.ts'
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

const enterBirth = async (month: string, year: string) => {
  await userEvent.selectOptions(await screen.findByLabelText('Month'), month)
  await userEvent.type(screen.getByLabelText('Year'), year)
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

const fillAccount = async ({ agree = true } = {}) => {
  await userEvent.type(await screen.findByLabelText('Email'), 'me@example.com')
  await userEvent.type(screen.getByLabelText('Password'), 'long-enough-pw')
  if (agree) await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

const BLOCKED = 'SomaNami is for learners 13 and older'

beforeEach(() => {
  // Fake only the clock, so user-event and promises still run normally.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 13))
  clearAgeBlock()
  resetTurnstileLoader()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  setSupabaseClient(undefined)
  delete window.turnstile
})

describe('age screen', () => {
  it('asks for month and year with neutral wording', async () => {
    installFakeSupabase()
    page()
    expect(
      await screen.findByRole('group', { name: 'When were you born?' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/13/)).not.toBeInTheDocument()
  })

  it('lets someone who is exactly 13 continue', async () => {
    installFakeSupabase()
    page()
    await enterBirth('November', '2013')
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
  })

  it('blocks someone who is 12 years and 11 months, calling nothing', async () => {
    const { auth } = installFakeSupabase()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    page()
    await enterBirth('December', '2013')

    expect(
      await screen.findByRole('heading', { name: BLOCKED }),
    ).toBeInTheDocument()
    expect(auth.signUp).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('stays blocked for the session, even after reloading', async () => {
    installFakeSupabase()
    const first = page()
    await enterBirth('January', '2020')
    await screen.findByRole('heading', { name: BLOCKED })
    first.unmount()

    page()
    expect(
      await screen.findByRole('heading', { name: BLOCKED }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Year')).not.toBeInTheDocument()
  })

  it('rejects a missing or impossible year', async () => {
    installFakeSupabase()
    page()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Continue' }),
    )
    expect(screen.getByLabelText('Month')).toHaveFocus()
    await enterBirth('March', '2090')
    expect(
      screen.getByText('Enter the year you were born.'),
    ).toBeInTheDocument()
  })
})

describe('account form', () => {
  it('sends only the age outcome and consent time, never the birth date', async () => {
    const { auth } = installFakeSupabase()
    installFakeTurnstile()
    page()
    await enterBirth('November', '2013')
    await fillAccount()

    expect(auth.signUp).toHaveBeenCalledOnce()
    const [payload] = auth.signUp.mock.calls[0] as unknown as [
      { options: { data: object; captchaToken: string } },
    ]
    expect(payload.options.data).toEqual({
      age_13_plus: true,
      consented_at: new Date(2026, 10, 13).toISOString(),
    })
    expect(payload.options.captchaToken).toBe('captcha-1')
    expect(JSON.stringify(payload)).not.toMatch(/2013|november|"11"/i)
    expect(
      await screen.findByRole('heading', { name: 'Check your email' }),
    ).toBeInTheDocument()
  })

  it('requires agreeing to the Terms and Privacy Notice', async () => {
    const { auth } = installFakeSupabase()
    page()
    await enterBirth('May', '2000')
    await fillAccount({ agree: false })

    expect(auth.signUp).not.toHaveBeenCalled()
    const box = screen.getByRole('checkbox')
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

  it('uses new-password and email autocomplete, and checks the length', async () => {
    const { auth } = installFakeSupabase()
    page()
    await enterBirth('May', '2000')
    expect(await screen.findByLabelText('Email')).toHaveAttribute(
      'autocomplete',
      'email',
    )
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('autocomplete', 'new-password')

    await userEvent.type(screen.getByLabelText('Email'), 'me@example.com')
    await userEvent.type(password, 'short')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(
      screen.getByRole('button', { name: 'Create account' }),
    )
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(auth.signUp).not.toHaveBeenCalled()
  })
})
