import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import {
  fakeSession,
  installFakeSupabase,
} from '../features/auth/testing/fake-supabase.ts'
import { renderAt } from '../features/auth/testing/render-routes.tsx'
import { setSupabaseClient } from '../lib/auth/supabase-client.ts'
import AccountPage from './AccountPage.tsx'

function setup() {
  installFakeSupabase({ session: fakeSession({ email: 'jamie.lee@uni.ac' }) })
  renderAt('/account', <Route path="/account" element={<AccountPage />} />)
}

const card = (name: string) => screen.findByRole('region', { name })

describe('Account settings', () => {
  afterEach(() => {
    setSupabaseClient(undefined)
    delete document.documentElement.dataset.theme
    localStorage.clear()
  })

  it('lays out the canvas’s cards in order', async () => {
    setup()
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Account settings',
      }),
    ).toBeInTheDocument()
    await screen.findByRole('region', { name: 'Two-step verification' })
    const titles = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent)
    expect(titles).toEqual([
      'Profile',
      'Appearance',
      'Privacy and data',
      'Sign out',
      'Two-step verification',
    ])
  })

  it('shows the email read-only, since names and photos aren’t stored yet', async () => {
    setup()
    const profile = await card('Profile')
    expect(within(profile).getByText('jamie.lee@uni.ac')).toBeInTheDocument()
    expect(within(profile).getByText('JL')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(within(profile).queryByRole('textbox')).toBeNull()
    expect(within(profile).queryByRole('button')).toBeNull()
  })

  it('switches the theme from Appearance', async () => {
    setup()
    const appearance = await card('Appearance')
    await userEvent.click(
      within(appearance).getByRole('radio', { name: 'Dark' }),
    )
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('shows no connection status or upload privacy claims', async () => {
    setup()
    const privacy = await card('Privacy and data')
    expect(
      within(privacy).getByRole('link', { name: 'How your data is handled' }),
    ).toHaveAttribute('href', '/privacy')
    expect(within(privacy).queryByRole('status')).toBeNull()
    const page = document.body.textContent ?? ''
    expect(page).not.toMatch(/offline|online|on this device|shared computer/i)
    expect(page).not.toMatch(/private|never leaves/i)
  })

  it('keeps removing materials under Privacy and data', async () => {
    setup()
    const privacy = await card('Privacy and data')
    expect(
      within(privacy).getByRole('button', {
        name: 'Remove my materials and sign out',
      }),
    ).toBeInTheDocument()
  })
})
