import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppRoutes } from './App.tsx'
import {
  fakeSession,
  installFakeSupabase,
} from './features/auth/testing/fake-supabase.ts'
import { setSupabaseClient } from './lib/auth/supabase-client.ts'
import { createMemoryAdapter, setStorageAdapter } from './lib/storage/index.ts'

function TrackLocation() {
  const { pathname, search } = useLocation()
  return (
    <p hidden data-testid="location">
      {pathname + search}
    </p>
  )
}

const currentLocation = () => screen.getByTestId('location').textContent

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <TrackLocation />
      <AppRoutes />
    </MemoryRouter>,
  )

const signInHeading = () =>
  screen.findByRole('heading', { level: 1, name: 'Welcome back' })

beforeEach(() => {
  window.localStorage.clear()
  setStorageAdapter(createMemoryAdapter())
})
afterEach(() => setSupabaseClient(undefined))

describe('signed out', () => {
  it.each([
    ['/', '/sign-in'],
    ['/library', '/sign-in?next=%2Flibrary'],
    ['/chat/doc-1', '/sign-in?next=%2Fchat%2Fdoc-1'],
    ['/account', '/sign-in?next=%2Faccount'],
    ['/nowhere?x=1', '/sign-in?next=%2Fnowhere%3Fx%3D1'],
  ])('redirects %s to %s', async (path, target) => {
    installFakeSupabase()
    renderAt(path)
    await signInHeading()
    expect(currentLocation()).toBe(target)
  })

  it.each([
    ['/sign-up', 'Create your account'],
    ['/forgot-password', 'Reset your password'],
    ['/your-data', 'How your data is handled'],
  ])('serves the public page %s', async (path, heading) => {
    installFakeSupabase()
    renderAt(path)
    expect(
      await screen.findByRole('heading', { level: 1, name: heading }),
    ).toBeInTheDocument()
    expect(currentLocation()).toBe(path)
  })

  it('returns to the original page after signing in', async () => {
    installFakeSupabase()
    renderAt('/library')
    await signInHeading()
    await userEvent.type(screen.getByLabelText('Email'), 'me@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'pw')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'My library' }),
    ).toBeInTheDocument()
    expect(currentLocation()).toBe('/library')
  })

  it('shows a quiet loading state while the session is restored', () => {
    installFakeSupabase({ session: fakeSession() })
    renderAt('/library')
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })
})

describe('details step', () => {
  it('sends an existing account without a profile there once, then back', async () => {
    installFakeSupabase({ session: fakeSession(), profile: null })
    renderAt('/library')
    await userEvent.type(await screen.findByLabelText('Display name'), 'Ada')
    expect(currentLocation()).toBe('/welcome/details?next=%2Flibrary')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'My library' }),
    ).toBeInTheDocument()
    expect(currentLocation()).toBe('/library')
  })

  it('sends a new Google account from the callback to the details step', async () => {
    installFakeSupabase({ profile: null })
    renderAt('/auth/callback?code=abc&next=%2Flibrary')
    expect(await screen.findByLabelText('Display name')).toBeInTheDocument()
    expect(currentLocation()).toBe('/welcome/details?next=%2Flibrary')
  })

  it('keeps the details step signed-in only', async () => {
    installFakeSupabase()
    renderAt('/welcome/details')
    await signInHeading()
    expect(currentLocation()).toBe('/sign-in?next=%2Fwelcome%2Fdetails')
  })
})

describe('signed in', () => {
  it('opens Account settings from the sidebar account menu', async () => {
    installFakeSupabase({ session: fakeSession({ email: 'me@example.com' }) })
    renderAt('/')
    const menu = await screen.findByRole('button', {
      name: 'me@example.com, account menu',
    })
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()

    await userEvent.click(menu)
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Account settings' }),
    )
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Account settings',
      }),
    ).toBeInTheDocument()
  })

  it('logs out from the account menu', async () => {
    const { auth } = installFakeSupabase({
      session: fakeSession({ email: 'me@example.com' }),
    })
    renderAt('/library')
    const menu = await screen.findByRole('button', {
      name: 'me@example.com, account menu',
    })
    expect(menu).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Log out' }))

    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    await signInHeading()
    expect(currentLocation()).toBe('/sign-in')
  })

  it('closes the account menu with Escape', async () => {
    installFakeSupabase({ session: fakeSession() })
    renderAt('/')
    const menu = await screen.findByRole('button', { name: /account menu/ })
    await userEvent.click(menu)
    await userEvent.keyboard('{Escape}')
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    expect(menu).toHaveFocus()
  })
})
