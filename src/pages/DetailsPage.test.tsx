import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasCompletedProfile } from '../features/auth/completed-profile.ts'
import {
  fakeSession,
  installFakeSupabase,
} from '../features/auth/testing/fake-supabase.ts'
import {
  redirectedTo,
  renderAt,
} from '../features/auth/testing/render-routes.tsx'
import { setSupabaseClient } from '../lib/auth/supabase-client.ts'
import DetailsPage from './DetailsPage.tsx'

const page = (path = '/welcome/details?next=%2Flibrary') =>
  renderAt(path, <Route path="/welcome/details" element={<DetailsPage />} />)

const nameField = () => screen.findByLabelText('Display name')
const submit = () =>
  userEvent.click(screen.getByRole('button', { name: 'Continue' }))

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  setSupabaseClient(undefined)
})

describe('details step', () => {
  it('asks for a display name and a yes/no age answer, never a birth date', async () => {
    installFakeSupabase({ session: fakeSession(), profile: null })
    page()
    expect(await nameField()).toHaveAttribute('autocomplete', 'name')
    expect(
      screen.getByRole('checkbox', { name: 'I’m 13 or older' }),
    ).not.toBeChecked()
    expect(screen.queryByText(/born|month|year/i)).not.toBeInTheDocument()
  })

  it('requires both answers and focuses the first problem', async () => {
    const { db } = installFakeSupabase({
      session: fakeSession(),
      profile: null,
    })
    page()
    await nameField()
    await submit()

    expect(screen.getByLabelText('Display name')).toHaveFocus()
    expect(screen.getByLabelText('Display name')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(
      screen.getByText('SomaNami is for learners 13 and older.'),
    ).toBeInTheDocument()
    expect(db.upsertProfile).not.toHaveBeenCalled()
  })

  it('saves the profile, remembers it and continues to next', async () => {
    const { db } = installFakeSupabase({
      session: fakeSession(),
      profile: null,
    })
    page()
    await userEvent.type(await nameField(), '  Ada ')
    await userEvent.click(screen.getByRole('checkbox'))
    await submit()

    expect(await redirectedTo()).toBe('/library')
    expect(db.upsertProfile).toHaveBeenCalledWith({
      id: 'user-1',
      display_name: 'Ada',
      age_13_plus: true,
    })
    expect(hasCompletedProfile('user-1')).toBe(true)
  })

  it('ignores an unsafe next', async () => {
    installFakeSupabase({ session: fakeSession(), profile: null })
    page('/welcome/details?next=%2F%2Fevil.example')
    await userEvent.type(await nameField(), 'Ada')
    await userEvent.click(screen.getByRole('checkbox'))
    await submit()
    expect(await redirectedTo()).toBe('/')
  })

  it('prefills answers saved earlier', async () => {
    installFakeSupabase({
      session: fakeSession(),
      profile: { display_name: 'Ada', age_13_plus: false },
    })
    page()
    expect(await nameField()).toHaveValue('Ada')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('starts from the name Google gave, if any', async () => {
    installFakeSupabase({
      session: fakeSession({ name: 'Ada Lovelace' }),
      profile: null,
    })
    page()
    expect(await nameField()).toHaveValue('Ada Lovelace')
  })

  it('explains a failed save without leaving the page', async () => {
    const { db } = installFakeSupabase({
      session: fakeSession(),
      profile: null,
    })
    db.upsertProfile.mockResolvedValueOnce({ error: new Error('denied') })
    page()
    await userEvent.type(await nameField(), 'Ada')
    await userEvent.click(screen.getByRole('checkbox'))
    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong',
    )
    expect(hasCompletedProfile('user-1')).toBe(false)
    expect(screen.getByLabelText('Display name')).toBeInTheDocument()
  })

  it('says when it can’t reach SomaNami', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    installFakeSupabase({ session: fakeSession(), profile: null })
    page()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We couldn’t reach SomaNami. Check your connection and try again.',
    )
    expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument()
  })

  it('lets someone sign out instead', async () => {
    const { auth } = installFakeSupabase({
      session: fakeSession(),
      profile: null,
    })
    page()
    await nameField()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(auth.signOut).toHaveBeenCalled()
  })
})
