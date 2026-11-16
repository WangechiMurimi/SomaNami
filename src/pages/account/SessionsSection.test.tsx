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
import {
  listOutbox,
  openUserStore,
  removeUserStore,
} from '../../lib/storage/index.ts'
import type { OutboxEntry } from '../../lib/storage/index.ts'
import {
  fakeSession,
  installFakeSupabase,
} from '../../features/auth/testing/fake-supabase.ts'
import {
  redirectedTo,
  renderAt,
} from '../../features/auth/testing/render-routes.tsx'
import {
  SYNC_OFF,
  SyncContext,
  SyncFlushError,
} from '../../features/sync/sync-context.ts'
import type { SyncContextValue } from '../../features/sync/sync-context.ts'
import SessionsSection from './SessionsSection.tsx'

vi.mock('../../lib/storage/index.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/storage/index.ts')>()),
  removeUserStore: vi.fn(),
  openUserStore: vi.fn(async () => {}),
  listOutbox: vi.fn(async () => []),
}))

// Shared by every fake, so a test can assert the order calls happened in.
let calls: string[]

const pendingChange = [{ id: 'workspaces:w1' } as OutboxEntry]

function setup(sync: Partial<SyncContextValue> = {}) {
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
  const value: SyncContextValue = {
    ...SYNC_OFF,
    status: 'idle',
    flush: vi.fn(async () => {
      calls.push('flush')
    }),
    eraseCloud: vi.fn(async () => {
      calls.push('eraseCloud')
    }),
    ...sync,
  }
  renderAt(
    '/account',
    <Route
      path="/account"
      element={
        <SyncContext.Provider value={value}>
          <SessionsSection />
        </SyncContext.Provider>
      }
    />,
  )
  return { ...fake, sync: value }
}

const offline = () => {
  const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  onTestFinished(() => spy.mockRestore())
}

describe('SessionsSection', () => {
  beforeEach(() => {
    vi.mocked(removeUserStore).mockReset()
    vi.mocked(openUserStore).mockClear()
    vi.mocked(listOutbox).mockResolvedValue([])
  })
  afterEach(() => setSupabaseClient(undefined))

  it('saves changes, clears this device, then signs out', async () => {
    const { auth } = setup()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out' }),
    )
    expect(await redirectedTo()).toBe('/sign-in')
    expect(calls).toEqual(['flush', 'removeUserStore:user-7', 'signOut'])
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('does the same for every device, and says when the others notice', async () => {
    const { auth } = setup()
    expect(
      await screen.findByText(/other devices sign out the next time/i),
    ).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Sign out of all devices' }),
    )
    expect(await redirectedTo()).toBe('/sign-in')
    expect(calls).toEqual(['flush', 'removeUserStore:user-7', 'signOut'])
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
  })

  it('won’t sign out other devices or erase while offline', async () => {
    offline()
    setup()
    expect(
      await screen.findByRole('button', { name: 'Sign out of all devices' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Erase my materials' }),
    ).toBeDisabled()
    expect(
      screen.getAllByText(/connect to the internet to use this/i),
    ).toHaveLength(2)
  })

  it('stays signed in when changes can’t be saved offline', async () => {
    vi.mocked(listOutbox).mockResolvedValue(pendingChange)
    const { auth } = setup({
      flush: vi.fn(async () => {
        throw new SyncFlushError('offline')
      }),
    })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have changes that haven’t saved yet. Connect to the internet to finish.',
    )
    expect(removeUserStore).not.toHaveBeenCalled()
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('signs out offline when nothing is waiting to be saved', async () => {
    setup({
      flush: vi.fn(async () => {
        throw new SyncFlushError('offline')
      }),
    })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out' }),
    )
    expect(await redirectedTo()).toBe('/sign-in')
    expect(calls).toEqual(['removeUserStore:user-7', 'signOut'])
  })

  it('stays signed in when saving fails', async () => {
    vi.mocked(listOutbox).mockResolvedValue(pendingChange)
    const { auth } = setup({
      flush: vi.fn(async () => {
        throw new SyncFlushError('failed')
      }),
    })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn’t save your latest changes/i,
    )
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('stays signed in, with the store reopened, when this device can’t be cleared', async () => {
    const { auth } = setup()
    vi.mocked(removeUserStore).mockRejectedValueOnce(new Error('blocked'))
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn’t clear this device/i,
    )
    expect(openUserStore).toHaveBeenCalledWith('user-7')
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('asks to close other tabs while they hold this device’s copy', async () => {
    setup()
    vi.mocked(removeUserStore).mockImplementationOnce(
      (_userId, options) =>
        new Promise(() => {
          options?.onBlocked?.()
        }),
    )
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Close SomaNami in your other tabs to finish.',
    )
  })

  describe('Erase my materials', () => {
    const openDialog = async () => {
      await userEvent.click(
        await screen.findByRole('button', { name: 'Erase my materials' }),
      )
      return screen.getByRole('alertdialog')
    }

    it('asks first, and Cancel erases nothing', async () => {
      const { auth, sync } = setup()
      const dialog = await openDialog()
      expect(dialog).toHaveAccessibleName(/erase all your materials/i)
      expect(dialog).toHaveTextContent(/on every device/i)

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Cancel' }),
      )
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(sync.eraseCloud).not.toHaveBeenCalled()
      expect(auth.signOut).not.toHaveBeenCalled()
    })

    it('erases the cloud, then this device, then signs out', async () => {
      setup()
      const dialog = await openDialog()
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Erase everything' }),
      )
      expect(await redirectedTo()).toBe('/sign-in')
      expect(calls).toEqual(['eraseCloud', 'removeUserStore:user-7', 'signOut'])
    })

    it('keeps everything and says so when the erase fails', async () => {
      const { auth } = setup({
        eraseCloud: vi.fn(async () => {
          throw new SyncFlushError('failed')
        }),
      })
      const dialog = await openDialog()
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Erase everything' }),
      )
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        /couldn’t erase your materials, so nothing was removed/i,
      )
      expect(removeUserStore).not.toHaveBeenCalled()
      expect(auth.signOut).not.toHaveBeenCalled()
    })
  })
})
