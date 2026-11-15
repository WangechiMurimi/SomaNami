import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSupabaseClient } from '../../lib/auth/supabase-client.ts'
import RequireProfile from './RequireProfile.tsx'
import {
  hasCompletedProfile,
  rememberCompletedProfile,
} from './completed-profile.ts'
import { writeLastUser } from './last-user.ts'
import { fakeSession, installFakeSupabase } from './testing/fake-supabase.ts'
import { redirectedTo, renderAt } from './testing/render-routes.tsx'

const page = (path = '/library?tab=all') =>
  renderAt(
    path,
    <Route element={<RequireProfile />}>
      <Route path="/library" element={<h1>Library</h1>} />
    </Route>,
  )

const library = () => screen.findByRole('heading', { name: 'Library' })

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  setSupabaseClient(undefined)
})

describe('RequireProfile', () => {
  it('sends an account without a profile to the details step, keeping next', async () => {
    installFakeSupabase({ session: fakeSession(), profile: null })
    page()
    expect(await redirectedTo()).toBe(
      '/welcome/details?next=%2Flibrary%3Ftab%3Dall',
    )
  })

  it('treats a profile without the 13-or-older answer as incomplete', async () => {
    installFakeSupabase({
      session: fakeSession(),
      profile: { display_name: 'Ada', age_13_plus: false },
    })
    page()
    expect(await redirectedTo()).toMatch(/^\/welcome\/details/)
  })

  it('opens the app for a complete profile and remembers it', async () => {
    const { db } = installFakeSupabase({ session: fakeSession() })
    page()
    expect(await library()).toBeInTheDocument()
    expect(db.readProfile).toHaveBeenCalledWith('user-1')
    expect(hasCompletedProfile('user-1')).toBe(true)
  })

  it('skips the check when this device already saw the profile complete', async () => {
    rememberCompletedProfile('user-1')
    const { db } = installFakeSupabase({
      session: fakeSession(),
      profile: null,
    })
    page()
    expect(await library()).toBeInTheDocument()
    expect(db.readProfile).not.toHaveBeenCalled()
  })

  it('does not reuse another user’s record', async () => {
    rememberCompletedProfile('someone-else')
    installFakeSupabase({ session: fakeSession(), profile: null })
    page()
    expect(await redirectedTo()).toMatch(/^\/welcome\/details/)
  })

  it('skips the check while signed in offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    writeLastUser({ id: 'user-1', email: 'learner@example.com' })
    const { db } = installFakeSupabase({
      session: fakeSession(),
      profile: null,
    })
    page()
    expect(await library()).toBeInTheDocument()
    expect(db.readProfile).not.toHaveBeenCalled()
  })

  it('shows nothing from the app before the session is restored', () => {
    installFakeSupabase({ session: fakeSession() })
    page()
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('offers a retry when the profile can’t be read', async () => {
    const { db } = installFakeSupabase({ session: fakeSession() })
    db.readProfile.mockResolvedValueOnce({
      data: null,
      error: new Error('down'),
    })
    page()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'couldn’t load your account details',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await library()).toBeInTheDocument()
    await waitFor(() => expect(db.readProfile).toHaveBeenCalledTimes(2))
  })
})
