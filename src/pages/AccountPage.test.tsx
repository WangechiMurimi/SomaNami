import { screen } from '@testing-library/react'
import { Route } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fakeSession,
  installFakeSupabase,
} from '../features/auth/testing/fake-supabase.ts'
import { renderAt } from '../features/auth/testing/render-routes.tsx'
import { setSupabaseClient } from '../lib/auth/supabase-client.ts'
import AccountPage from './AccountPage.tsx'

const page = () =>
  renderAt('/account', <Route path="/account" element={<AccountPage />} />)

afterEach(() => {
  vi.restoreAllMocks()
  setSupabaseClient(undefined)
})

describe('AccountPage', () => {
  it('shows the display name, with a way to change it', async () => {
    installFakeSupabase({
      session: fakeSession({ email: 'ada@example.com' }),
      profile: { display_name: 'Ada', age_13_plus: true },
    })
    page()
    expect(await screen.findByText('Ada')).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Change your name' }),
    ).toHaveAttribute('href', '/welcome/details?next=%2Faccount')
  })

  it('says so when the name can’t be loaded', async () => {
    const { db } = installFakeSupabase({ session: fakeSession() })
    db.readProfile.mockResolvedValueOnce({ data: null, error: new Error('x') })
    page()
    expect(
      await screen.findByText('We couldn’t load your name.'),
    ).toBeInTheDocument()
  })

  it('explains that the name needs a connection', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    installFakeSupabase({ session: fakeSession() })
    page()
    expect(
      await screen.findByText('Connect to the internet to see your name.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Change your name' }),
    ).not.toBeInTheDocument()
  })
})
