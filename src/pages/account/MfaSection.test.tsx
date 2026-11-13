import { AuthApiError } from '@supabase/supabase-js'
import type { Factor } from '@supabase/supabase-js'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Mock } from 'vitest'
import { setSupabaseClient } from '../../lib/auth/supabase-client.ts'
import {
  fakeSession,
  installFakeSupabase,
} from '../../features/auth/testing/fake-supabase.ts'
import { renderAt } from '../../features/auth/testing/render-routes.tsx'
import MfaSection from './MfaSection.tsx'

type Status = 'verified' | 'unverified'

const factor = (id: string, status: Status, friendlyName?: string): Factor =>
  ({
    id,
    friendly_name: friendlyName,
    factor_type: 'totp',
    status,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }) as Factor

// Cast: the fake's mocks are typed by their success results.
const wrongCode = () =>
  ({
    data: null,
    error: new AuthApiError(
      'Invalid TOTP code entered',
      422,
      'mfa_verification_failed',
    ),
  }) as never

/**
 * A signed-in account with `factors`. Enrolling adds an unverified factor,
 * verifying marks it verified and unenrolling removes it, like Supabase.
 */
function setup(factors: Factor[] = []) {
  const session = fakeSession()
  session.user.factors = factors
  const fake = installFakeSupabase({ session, aal: 'aal2' })
  // The fake's mocks are typed without arguments; these overrides read them.
  const auth = fake.auth as unknown as {
    mfa: {
      enroll: Mock<(p: { friendlyName?: string }) => Promise<unknown>>
      challengeAndVerify: Mock<(p: { factorId: string }) => Promise<unknown>>
      unenroll: Mock<(p: { factorId: string }) => Promise<unknown>>
      listFactors: Mock<() => Promise<unknown>>
    }
  }
  const list = () => fake.state.session!.user.factors!
  auth.mfa.enroll.mockImplementation(async ({ friendlyName }) => {
    const id = `factor-${list().length + 1}`
    fake.state.session!.user.factors = [
      ...list(),
      factor(id, 'unverified', friendlyName),
    ]
    return {
      data: {
        id,
        type: 'totp',
        friendly_name: friendlyName,
        totp: {
          qr_code: '<svg/>',
          secret: 'JBSWY3DPEHPK3PXP',
          uri: 'otpauth://x',
        },
      },
      error: null,
    }
  })
  auth.mfa.challengeAndVerify.mockImplementation(async ({ factorId }) => {
    fake.state.session!.user.factors = list().map((f) =>
      f.id === factorId ? { ...f, status: 'verified' } : f,
    )
    return { data: {}, error: null }
  })
  auth.mfa.unenroll.mockImplementation(async ({ factorId }) => {
    fake.state.session!.user.factors = list().filter((f) => f.id !== factorId)
    return { data: { id: factorId }, error: null }
  })
  const view = renderAt(
    '/account',
    <Route path="/account" element={<MfaSection />} />,
  )
  return { ...fake, auth, ...view, factors: list }
}

/** Waits for the section's On/Off pill to read `state`. */
const expectState = (state: 'On' | 'Off') =>
  waitFor(() =>
    expect(
      within(
        screen.getByRole('region', { name: 'Two-step verification' }),
      ).getByText(state),
    ).toBeVisible(),
  )

const turnOn = async () =>
  userEvent.click(
    await screen.findByRole('button', {
      name: 'Turn on two-step verification',
    }),
  )

beforeEach(() => window.localStorage.clear())
afterEach(() => setSupabaseClient(undefined))

describe('MfaSection: turning it on', () => {
  it('starts off, with a button to turn it on', async () => {
    setup()
    await expectState('Off')
    expect(
      screen.getByRole('button', { name: 'Turn on two-step verification' }),
    ).toBeInTheDocument()
  })

  it('shows the QR code and secret, then turns on after a code', async () => {
    const user = userEvent.setup()
    const { auth } = setup()
    await user.click(
      await screen.findByRole('button', {
        name: 'Turn on two-step verification',
      }),
    )

    expect(auth.mfa.enroll).toHaveBeenCalledWith({
      factorType: 'totp',
      friendlyName: 'Authenticator app',
    })
    const qr = await screen.findByRole('img', {
      name: /QR code for your authenticator app/,
    })
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Copy key' }))
    expect(await navigator.clipboard.readText()).toBe('JBSWY3DPEHPK3PXP')
    expect(await screen.findByText('Key copied.')).toBeVisible()

    await user.type(screen.getByLabelText('6-digit code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))

    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'factor-1',
      code: '123456',
    })
    expect(
      await screen.findByText('Two-step verification is on.'),
    ).toBeVisible()
    await expectState('On')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(
      screen.getByRole('list', { name: 'Your authenticators' }),
    ).toHaveTextContent('Authenticator app')
  })

  it('moves focus to the setup steps', async () => {
    setup()
    await turnOn()
    const heading = await screen.findByRole('heading', {
      name: 'Add SomaNami to your authenticator app',
    })
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('keeps the setup open after a wrong code', async () => {
    const { auth } = setup()
    auth.mfa.challengeAndVerify.mockResolvedValueOnce(wrongCode())
    await turnOn()
    const input = await screen.findByLabelText('6-digit code')
    await userEvent.type(input, '000000')
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }))

    expect(await screen.findByText(/That code didn’t work/)).toBeVisible()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(input).toHaveFocus())
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('checks the code before sending it', async () => {
    const { auth } = setup()
    await turnOn()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Turn on' }),
    )
    expect(
      await screen.findByText('Enter the 6-digit code from your app.'),
    ).toBeVisible()
    expect(auth.mfa.challengeAndVerify).not.toHaveBeenCalled()
  })

  it('removes the unconfirmed authenticator when setup is cancelled', async () => {
    const { auth, factors } = setup()
    await turnOn()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'factor-1' })
    expect(factors()).toEqual([])
    expect(
      await screen.findByRole('button', {
        name: 'Turn on two-step verification',
      }),
    ).toHaveFocus()
  })

  it('removes the unconfirmed authenticator when the page is left', async () => {
    const { auth, unmount } = setup()
    await turnOn()
    await screen.findByRole('img')
    unmount()
    await waitFor(() =>
      expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'factor-1' }),
    )
  })

  it('clears authenticators left by an abandoned setup when a new one starts', async () => {
    const { auth, factors } = setup([
      factor('old-1', 'unverified', 'Authenticator app'),
    ])
    await expectState('Off')
    // Only viewing the page must not cancel a setup open on another device.
    expect(auth.mfa.unenroll).not.toHaveBeenCalled()

    await turnOn()
    await screen.findByRole('img')
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'old-1' })
    expect(auth.mfa.enroll).toHaveBeenCalledWith({
      factorType: 'totp',
      friendlyName: 'Authenticator app',
    })
    expect(factors().map((f) => f.status)).toEqual(['unverified'])
  })

  it('picks a free name when a leftover cannot be removed', async () => {
    const { auth } = setup([factor('old-1', 'unverified', 'Authenticator app')])
    auth.mfa.unenroll.mockResolvedValueOnce({
      data: null,
      error: new TypeError('Failed to fetch'),
    })
    await turnOn()
    await screen.findByRole('img')
    expect(auth.mfa.enroll).toHaveBeenCalledWith({
      factorType: 'totp',
      friendlyName: 'Authenticator app 2',
    })
  })

  it('reports a failure to start setup', async () => {
    const { auth } = setup()
    auth.mfa.enroll.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await turnOn()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You’re offline. Reconnect, then try again.',
    )
  })

  it('reports a failure to load the authenticators, with a retry', async () => {
    const session = fakeSession()
    const { auth } = installFakeSupabase({ session, aal: 'aal2' })
    auth.mfa.listFactors.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderAt('/account', <Route path="/account" element={<MfaSection />} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You’re offline. Reconnect, then try again.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('button', {
        name: 'Turn on two-step verification',
      }),
    ).toBeInTheDocument()
  })
})

describe('MfaSection: when it is on', () => {
  it('lists the authenticator and encourages a backup', async () => {
    setup([factor('phone', 'verified', 'Phone')])
    await expectState('On')
    expect(
      screen.getByRole('list', { name: 'Your authenticators' }),
    ).toHaveTextContent('Phone')
    expect(screen.getByText(/add a second authenticator/i)).toBeVisible()
  })

  it('adds a backup authenticator under a new name', async () => {
    const { auth } = setup([factor('phone', 'verified', 'Authenticator app')])
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a backup authenticator' }),
    )
    expect(auth.mfa.enroll).toHaveBeenCalledWith({
      factorType: 'totp',
      friendlyName: 'Authenticator app 2',
    })
    await userEvent.type(await screen.findByLabelText('6-digit code'), '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    const list = await screen.findByRole('list', {
      name: 'Your authenticators',
    })
    await waitFor(() =>
      expect(within(list).getAllByRole('listitem')).toHaveLength(2),
    )
  })

  it('needs a fresh code before removing an authenticator', async () => {
    const { auth, factors } = setup([factor('phone', 'verified', 'Phone')])
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove Phone' }),
    )
    const input = await screen.findByLabelText('6-digit code from Phone')
    await waitFor(() => expect(input).toHaveFocus())

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove authenticator' }),
    )
    expect(
      await screen.findByText('Enter the 6-digit code from your app.'),
    ).toBeVisible()
    expect(auth.mfa.unenroll).not.toHaveBeenCalled()

    await userEvent.type(input, '123456')
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove authenticator' }),
    )
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'phone',
      code: '123456',
    })
    await waitFor(() =>
      expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'phone' }),
    )
    expect(factors()).toEqual([])
    expect(
      await screen.findByText(
        'Authenticator removed. Two-step verification is off.',
      ),
    ).toBeVisible()
    await expectState('Off')
  })

  it('keeps the authenticator after a wrong code', async () => {
    const { auth } = setup([factor('phone', 'verified', 'Phone')])
    auth.mfa.challengeAndVerify.mockResolvedValueOnce(wrongCode())
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove Phone' }),
    )
    await userEvent.type(
      await screen.findByLabelText('6-digit code from Phone'),
      '000000',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove authenticator' }),
    )
    expect(await screen.findByText(/That code didn’t work/)).toBeVisible()
    expect(auth.mfa.unenroll).not.toHaveBeenCalled()
  })

  it('cancels a removal and returns focus to its button', async () => {
    setup([factor('phone', 'verified', 'Phone')])
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove Phone' }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(
      screen.queryByLabelText('6-digit code from Phone'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Phone' })).toHaveFocus()
  })
})
