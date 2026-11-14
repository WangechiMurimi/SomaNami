import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest'
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

// Shared by both fakes, so a test can assert the order calls happened in.
let calls: string[]

function setup() {
  calls = []
  const fake = installFakeSupabase({ session: fakeSession({ id: 'user-7' }) })
  const signOut = fake.auth.signOut.getMockImplementation()!
  fake.auth.signOut.mockImplementation(async (...args) => {
    calls.push('signOut')
    return signOut(...args)
  })
  vi.mocked(removeUserStore).mockImplementation(async (userId) => {
    calls.push(`removeUserStore:${userId}`)
  })
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
      await screen.findByText(/other devices sign out the next time/i),
    ).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Sign out of all devices' }),
    )
    expect(await redirectedTo()).toBe('/sign-in')
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
    expect(removeUserStore).not.toHaveBeenCalled()
  })

  it('won’t sign out other devices while offline', async () => {
    const offline = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    onTestFinished(() => offline.mockRestore())
    setup()
    expect(
      await screen.findByRole('button', { name: 'Sign out of all devices' }),
    ).toBeDisabled()
    expect(screen.getByText(/connect to the internet/i)).toBeInTheDocument()
  })

  it('asks before removing materials, and Cancel keeps everything', async () => {
    const { auth } = setup()
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Sign out and remove my materials from this device',
      }),
    )
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveAccessibleName(/remove your materials/i)
    expect(removeUserStore).not.toHaveBeenCalled()

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(removeUserStore).not.toHaveBeenCalled()
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('removes this user’s materials, then signs out', async () => {
    setup()
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Sign out and remove my materials from this device',
      }),
    )
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Remove and sign out',
      }),
    )
    expect(await redirectedTo()).toBe('/sign-in')
    expect(calls).toEqual(['removeUserStore:user-7', 'signOut'])
  })

  it('stays signed in and says so when the materials can’t be removed', async () => {
    const { auth } = setup()
    vi.mocked(removeUserStore).mockRejectedValueOnce(new Error('blocked'))
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Sign out and remove my materials from this device',
      }),
    )
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Remove and sign out',
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn’t remove/i,
    )
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(auth.signOut).not.toHaveBeenCalled()
  })
})
