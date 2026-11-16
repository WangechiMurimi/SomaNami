import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderSignedInApp } from '../features/auth/testing/render-app.tsx'
import { createMemoryAdapter, setStorageAdapter } from '../lib/storage/index.ts'

// The product is explained by its grounding, not by where data lives or by
// connectivity (#177): no device, offline or upload-privacy notes.
const NOT_HERE = 'It may have been removed.'

beforeEach(() => {
  setStorageAdapter(createMemoryAdapter())
  window.history.pushState({}, '', '/')
})

describe('Account-aware device copy', () => {
  it('shows no device or connection panel in the sidebar', async () => {
    await renderSignedInApp('/')
    expect(screen.queryByRole('region', { name: 'On this device' })).toBeNull()
    expect(screen.queryByText(/online|offline/i)).toBeNull()
  })

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
    expect(screen.queryByText(/another device/)).toBeNull()
  })

  it('makes no offline claim about saved conversations', async () => {
    await renderSignedInApp('/conversations')
    expect(
      await screen.findByText(
        /Chats you saved from Recents and your workspaces/,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/offline/)).toBeNull()
  })

  it('keeps the help page free of offline, device and privacy notes', async () => {
    await renderSignedInApp('/help')
    expect(
      await screen.findByRole('heading', { name: 'Adding materials' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/offline|this device|private copy|privately/i),
    ).toBeNull()
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
