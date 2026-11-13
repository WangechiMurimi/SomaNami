import { AuthApiError } from '@supabase/supabase-js'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
import UpdatePasswordPage from './UpdatePasswordPage.tsx'

const page = () =>
  renderAt(
    '/update-password',
    <Route path="/update-password" element={<UpdatePasswordPage />} />,
  )

afterEach(() => setSupabaseClient(undefined))

describe('UpdatePasswordPage', () => {
  it('explains an expired or used link when there is no session', async () => {
    installFakeSupabase()
    page()
    expect(
      await screen.findByRole('heading', { name: 'This link has expired' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Request a new link' }),
    ).toHaveAttribute('href', '/forgot-password')
  })

  it('sets a new password from the recovery session', async () => {
    const { auth } = installFakeSupabase({ session: fakeSession() })
    page()
    const password = await screen.findByLabelText('New password')
    expect(password).toHaveAttribute('autocomplete', 'new-password')

    await userEvent.type(password, 'a-brand-new-pass')
    await userEvent.click(
      screen.getByRole('button', { name: 'Save new password' }),
    )
    expect(auth.updateUser).toHaveBeenCalledWith({
      password: 'a-brand-new-pass',
    })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your password is updated',
    )
  })

  it('rejects a short password before sending', async () => {
    const { auth } = installFakeSupabase({ session: fakeSession() })
    page()
    await userEvent.type(await screen.findByLabelText('New password'), 'short')
    await userEvent.click(
      screen.getByRole('button', { name: 'Save new password' }),
    )
    expect(screen.getByLabelText('New password')).toHaveFocus()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('reports a password Supabase refuses', async () => {
    const { auth } = installFakeSupabase({ session: fakeSession() })
    auth.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthApiError('same', 422, 'same_password'),
    } as never)
    page()
    await userEvent.type(
      await screen.findByLabelText('New password'),
      'the-old-password',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Save new password' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a stronger password',
    )
  })

  it('asks for the authenticator code first when the account has one', async () => {
    installFakeSupabase({ session: fakeSession({ mfa: true }) })
    page()
    expect(await redirectedTo()).toBe('/sign-in/verify?next=%2Fupdate-password')
  })
})
