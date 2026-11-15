import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSupabaseClient } from '../../lib/auth/supabase-client.ts'
import { removeUserStore } from '../../lib/storage/index.ts'
import {
  fakeSession,
  installFakeSupabase,
} from '../../features/auth/testing/fake-supabase.ts'
import {
  redirectedTo,
  renderAt,
} from '../../features/auth/testing/render-routes.tsx'
import SessionsSection from './SessionsSection.tsx'

vi.mock('../../lib/storage/index.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/storage/index.ts')>()),
  removeUserStore: vi.fn(),
}))

function setup() {
  const fake = installFakeSupabase({ session: fakeSession({ id: 'user-7' }) })
  renderAt('/account', <Route path="/account" element={<SessionsSection />} />)
  return fake
}

describe('SessionsSection', () => {
  beforeEach(() => vi.mocked(removeUserStore).mockReset())
  afterEach(() => setSupabaseClient(undefined))

  it('signs out this device only', async () => {
    const { auth } = setup()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out' }),
    )
    expect(await redirectedTo()).toBe('/sign-in')
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(removeUserStore).not.toHaveBeenCalled()
  })

  it('signs out every device, and says when the others notice', async () => {
    const { auth } = setup()
    expect(
      await screen.findByText(/other devices are signed out the next time/i),
    ).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Sign out of all devices' }),
    )
    expect(await redirectedTo()).toBe('/sign-in')
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
    expect(removeUserStore).not.toHaveBeenCalled()
  })

  it('says which account is signed in', async () => {
    installFakeSupabase({
      session: fakeSession({ id: 'user-7', email: 'me@example.com' }),
    })
    renderAt(
      '/account',
      <Route path="/account" element={<SessionsSection />} />,
    )
    expect(
      await screen.findByText('Signed in as me@example.com.'),
    ).toBeInTheDocument()
  })
})
