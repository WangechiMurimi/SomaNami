import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  delete document.documentElement.dataset.theme
  localStorage.clear()
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

  it('says the name couldn’t load without a fresh session', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    installFakeSupabase({ session: fakeSession() })
    page()
    expect(
      await screen.findByText('We couldn’t load your name.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Change your name' }),
    ).not.toBeInTheDocument()
  })

  it('lays out the canvas’s cards, then sign-out', async () => {
    installFakeSupabase({ session: fakeSession() })
    page()
    await screen.findByRole('heading', { level: 1, name: 'Account settings' })
    const titles = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent)
    expect(titles).toEqual(['Profile', 'Appearance', 'Sign out'])
  })

  it('switches the theme from Appearance', async () => {
    installFakeSupabase({ session: fakeSession() })
    page()
    const appearance = await screen.findByRole('region', {
      name: 'Appearance',
    })
    await userEvent.click(
      within(appearance).getByRole('radio', { name: 'Dark' }),
    )
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('shows no connection status or privacy claims', async () => {
    installFakeSupabase({ session: fakeSession() })
    page()
    await screen.findByRole('heading', { level: 1, name: 'Account settings' })
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/offline|online|on this device|shared computer/i)
    expect(text).not.toMatch(/private|never leaves/i)
  })
})
