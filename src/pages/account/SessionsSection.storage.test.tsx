import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IDBFactory } from 'fake-indexeddb'
import { Route } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSupabaseClient } from '../../lib/auth/supabase-client.ts'
import {
  DEFAULT_WORKSPACE,
  closeUserStore,
  listDocuments,
  saveDocument,
  userDbName,
} from '../../lib/storage/index.ts'
import {
  fakeSession,
  installFakeSupabase,
} from '../../features/auth/testing/fake-supabase.ts'
import {
  redirectedTo,
  renderAt,
} from '../../features/auth/testing/render-routes.tsx'
import UserStoreGate from '../../features/auth/UserStoreGate.tsx'
import SessionsSection from './SessionsSection.tsx'

// Runs against real per-user IndexedDB stores (fake-indexeddb), so it covers
// what the unit tests mock away: the store closing under a mounted app.
let factory: IDBFactory

const databaseNames = async () =>
  (await factory.databases()).map((info) => info.name)

async function renderWithMaterial() {
  installFakeSupabase({ session: fakeSession({ id: 'user-7' }) })
  renderAt(
    '/account',
    <Route
      path="/account"
      element={
        <UserStoreGate>
          <SessionsSection />
        </UserStoreGate>
      }
    />,
  )
  await screen.findByRole('heading', { name: 'Sign out' })
  await saveDocument(
    {
      id: 'notes',
      name: 'notes.txt',
      size: 1,
      kind: 'text',
      pageCount: 1,
      chunks: [],
    },
    DEFAULT_WORKSPACE.id,
  )
}

async function confirmRemoval() {
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Sign out and remove my materials from this device',
    }),
  )
  await userEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Remove and sign out',
    }),
  )
}

describe('SessionsSection with real storage', () => {
  beforeEach(() => {
    factory = new IDBFactory()
    vi.stubGlobal('indexedDB', factory)
  })
  afterEach(() => {
    closeUserStore()
    setSupabaseClient(undefined)
    vi.unstubAllGlobals()
  })

  it('deletes this user’s database and signs out', async () => {
    await renderWithMaterial()
    expect(await databaseNames()).toContain(userDbName('user-7'))

    await confirmRemoval()

    expect(await redirectedTo()).toBe('/sign-in')
    expect(await databaseNames()).not.toContain(userDbName('user-7'))
  })

  it('keeps the library usable when the delete fails', async () => {
    await renderWithMaterial()
    vi.spyOn(factory, 'deleteDatabase').mockImplementationOnce(() => {
      const request = { error: new DOMException('blocked') } as IDBOpenDBRequest
      setTimeout(() => request.onerror?.(new Event('error')))
      return request
    })

    await confirmRemoval()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /still signed in/i,
    )
    expect((await listDocuments()).map((d) => d.id)).toEqual(['notes'])
  })
})
