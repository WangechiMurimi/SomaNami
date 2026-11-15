import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderSignedInApp } from '../features/auth/testing/render-app.tsx'
import { createMemoryAdapter, setStorageAdapter } from '../lib/storage/index.ts'

// Materials belong to an account but live on one device until sync ships, so
// the copy must say both, and never imply another device holds a copy.
const NOT_HERE =
  'It may have been removed, or added on another device. For now, each device keeps its own materials and chats.'

beforeEach(() => {
  setStorageAdapter(createMemoryAdapter())
  window.history.pushState({}, '', '/')
})

describe('Account-aware device copy', () => {
  it.each([
    ['/chat/missing', 'We can’t find that material'],
    ['/chats/missing', 'We can’t find that chat'],
    ['/workspaces/missing', 'We can’t find that workspace'],
  ])('words the %s not-found state for accounts', async (path, heading) => {
    await renderSignedInApp(path)
    expect(
      await screen.findByRole('heading', { name: heading }),
    ).toBeInTheDocument()
    expect(screen.getByText(NOT_HERE, { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(/saved on another device/)).toBeNull()
  })

  it('says saved conversations belong to the account on this device', async () => {
    await renderSignedInApp('/conversations')
    expect(
      await screen.findByText(
        /Every chat is saved to your account on this device/,
      ),
    ).toBeInTheDocument()
  })

  it('explains on the help page that materials don’t follow to other devices yet', async () => {
    await renderSignedInApp('/help')
    expect(
      await screen.findByText(
        /saved to your account on this device.*don’t appear on your other devices yet/,
      ),
    ).toBeInTheDocument()
  })

  describe('sidebar profile row (#125)', () => {
    it('shows the signed-in account as the account menu', async () => {
      await renderSignedInApp('/')
      const trigger = screen.getByRole('button', {
        name: 'learner@example.com, account menu',
      })
      expect(trigger).toHaveTextContent('L')
    })

    it('no longer says there is no account', async () => {
      await renderSignedInApp('/')
      expect(screen.queryByText('Guest')).toBeNull()
      expect(screen.queryByText('No account needed')).toBeNull()
    })
  })
})
