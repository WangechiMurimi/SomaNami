import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../App.tsx'
import {
  fakeSession,
  installFakeSupabase,
} from '../features/auth/testing/fake-supabase.ts'
import { setSupabaseClient } from '../lib/auth/supabase-client.ts'
import { createMemoryAdapter, setStorageAdapter } from '../lib/storage/index.ts'

const TRIGGER = 'learner@example.com, account menu'

async function setup() {
  const fake = installFakeSupabase({ session: fakeSession() })
  render(<App />)
  await screen.findByRole('navigation', { name: 'Main' })
  return {
    auth: fake.auth,
    trigger: screen.getByRole('button', { name: TRIGGER }),
  }
}

beforeEach(() => {
  setStorageAdapter(createMemoryAdapter())
  window.history.pushState({}, '', '/')
})

afterEach(() => {
  setSupabaseClient(undefined)
  localStorage.clear()
})

describe('sidebar account menu', () => {
  it('opens a menu with Account settings and Log out', async () => {
    const { trigger } = await setup()
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveTextContent('learner@example.com')

    await userEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const items = screen.getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Account settings',
      'Log out',
    ])
    expect(items[0]).toHaveAttribute('href', '/account')
    expect(items[0]).toHaveFocus()
  })

  it('moves between items with the arrow keys', async () => {
    const { trigger } = await setup()
    await userEvent.click(trigger)
    const [settings, logOut] = screen.getAllByRole('menuitem')

    await userEvent.keyboard('{ArrowDown}')
    expect(logOut).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(settings).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(logOut).toHaveFocus()
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const { trigger } = await setup()
    await userEvent.click(trigger)

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('closes when clicking outside it', async () => {
    const { trigger } = await setup()
    await userEvent.click(trigger)

    await userEvent.click(screen.getByRole('main'))

    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens Account settings', async () => {
    const { trigger } = await setup()
    await userEvent.click(trigger)

    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Account settings' }),
    )

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Account settings',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('logs out of this device without visiting Settings', async () => {
    const { auth, trigger } = await setup()
    await userEvent.click(trigger)

    await userEvent.click(screen.getByRole('menuitem', { name: 'Log out' }))

    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome back' }),
    ).toBeInTheDocument()
  })

  it('shows only the avatar in the collapsed rail, with the account as its name', async () => {
    await setup()
    await userEvent.click(
      screen.getByRole('button', { name: 'Collapse sidebar' }),
    )

    const trigger = screen.getByRole('button', { name: TRIGGER })
    expect(trigger).toHaveTextContent(/^L$/)
    expect(trigger).toHaveAttribute('title', 'learner@example.com')
    await userEvent.click(trigger)
    expect(screen.getByRole('menu', { name: 'Account' })).toBeInTheDocument()
  })
})
