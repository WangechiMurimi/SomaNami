import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router'
import { describe, expect, it } from 'vitest'
import RequireAuth from './RequireAuth.tsx'
import { fakeSession, installFakeSupabase } from './testing/fake-supabase.ts'
import { renderAt } from './testing/render-routes.tsx'

const routes = (
  <Route element={<RequireAuth />}>
    <Route path="/" element={<p>Home</p>} />
  </Route>
)

const dialog = () =>
  screen.findByRole('dialog', { name: 'Welcome to SomaNami' })

describe('first-use 13+ and Terms check', () => {
  it('is not shown to an account that already answered', async () => {
    installFakeSupabase({ session: fakeSession() })
    renderAt('/', routes)
    expect(await screen.findByText('Home')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('requires both answers, then saves them and closes', async () => {
    const { auth } = installFakeSupabase({
      session: fakeSession({ ageConfirmed: false }),
    })
    renderAt('/', routes)
    await dialog()

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(
      screen.getByText('SomaNami is for learners 13 and older.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Agree to the Terms and how your data is handled/),
    ).toBeInTheDocument()
    expect(auth.updateUser).not.toHaveBeenCalled()

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'I’m 13 or older' }),
    )
    await userEvent.click(
      screen.getByRole('checkbox', { name: /I agree to the Terms/ }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(auth.updateUser).toHaveBeenCalledWith({
      data: { age_13_plus: true, consented_at: expect.any(String) },
    })
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  })

  it('lets the user sign out instead', async () => {
    const { auth } = installFakeSupabase({
      session: fakeSession({ ageConfirmed: false }),
    })
    renderAt('/', routes)
    await dialog()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
