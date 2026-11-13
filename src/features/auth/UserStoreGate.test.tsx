import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  closeUserStore,
  createIndexedDbAdapter,
  DB_NAME,
  DOCUMENTS,
  listDocuments,
  saveDocument,
  setStorageAdapter,
  userDbName,
} from '../../lib/storage/index.ts'
import type { StoredDocument } from '../../types/contracts.ts'
import type { AuthContextValue, AuthStatus } from '../../types/auth.ts'
import UserStoreGate, { LEGACY_CHECK_TIMEOUT_MS } from './UserStoreGate.tsx'
import { AuthContext } from './auth-context.ts'

const doc = (id: string): StoredDocument => ({
  id,
  name: `${id}.txt`,
  size: 1,
  kind: 'text',
  pageCount: 1,
  chunks: [],
})

const session = (
  userId: string | null,
  status: AuthStatus = 'signed-in',
): AuthContextValue =>
  ({
    status,
    user: userId ? { id: userId, email: `${userId}@example.com` } : null,
  }) as AuthContextValue

// Reads storage as soon as it mounts, as LibraryProvider does.
function Library() {
  const [names, setNames] = useState<string[] | null>(null)
  useEffect(() => {
    listDocuments().then((docs) => setNames(docs.map((d) => d.id)))
  }, [])
  return names ? <p>library: {names.join(',') || 'empty'}</p> : null
}

const Harness = ({
  auth,
  children,
}: {
  auth: AuthContextValue
  children: ReactNode
}) => (
  <AuthContext.Provider value={auth}>
    <UserStoreGate>{children}</UserStoreGate>
  </AuthContext.Provider>
)

let factory: IDBFactory

async function seed(name: string, ids: string[]) {
  const adapter = createIndexedDbAdapter(factory, { name })
  for (const id of ids) await adapter.put(DOCUMENTS, doc(id))
  await adapter.close()
}

const databaseNames = async () =>
  (await factory.databases()).map((info) => info.name)

beforeEach(() => {
  setStorageAdapter(null)
  factory = new IDBFactory()
  vi.stubGlobal('indexedDB', factory)
  localStorage.clear()
})
afterEach(() => {
  closeUserStore()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('UserStoreGate', () => {
  it('shows a quiet loading state, then the children once the store is open', async () => {
    await seed(userDbName('ada'), ['ada-notes'])
    render(
      <Harness auth={session('ada')}>
        <Library />
      </Harness>,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      /opening your materials/i,
    )
    expect(await screen.findByText('library: ada-notes')).toBeInTheDocument()
  })

  it('opens the store for an offline session too', async () => {
    await seed(userDbName('ada'), ['ada-notes'])
    render(
      <Harness auth={session('ada', 'signed-in-offline')}>
        <Library />
      </Harness>,
    )
    expect(await screen.findByText('library: ada-notes')).toBeInTheDocument()
  })

  it.each<AuthStatus>(['loading', 'signed-out', 'needs-mfa'])(
    'renders nothing that reads storage while %s',
    async (status) => {
      render(
        <Harness auth={session(status === 'needs-mfa' ? 'ada' : null, status)}>
          <Library />
        </Harness>,
      )
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(screen.queryByText(/library:/)).not.toBeInTheDocument()
    },
  )

  it('reopens the right store when the user changes', async () => {
    await seed(userDbName('ada'), ['ada-notes'])
    await seed(userDbName('ben'), ['ben-notes'])
    const { rerender } = render(
      <Harness auth={session('ada')}>
        <Library key="ada" />
      </Harness>,
    )
    expect(await screen.findByText('library: ada-notes')).toBeInTheDocument()

    rerender(
      <Harness auth={session('ben')}>
        <Library key="ben" />
      </Harness>,
    )
    expect(await screen.findByText('library: ben-notes')).toBeInTheDocument()
    expect(screen.queryByText('library: ada-notes')).not.toBeInTheDocument()
  })

  it('ends up on the last user after a fast switch', async () => {
    const { rerender } = render(
      <Harness auth={session('ada')}>
        <Library key="ada" />
      </Harness>,
    )
    // Switch before Ada's store has finished opening.
    rerender(
      <Harness auth={session('ben')}>
        <Library key="ben" />
      </Harness>,
    )
    expect(await screen.findByText('library: empty')).toBeInTheDocument()

    await saveDocument(doc('written-after-switch'))
    closeUserStore()
    const ben = createIndexedDbAdapter(factory, { name: userDbName('ben') })
    expect((await ben.getAll(DOCUMENTS)).map((d) => d.id)).toEqual([
      'written-after-switch',
    ])
    await ben.close()
  })

  it('closes the store when the user signs out', async () => {
    const { rerender } = render(
      <Harness auth={session('ada')}>
        <Library />
      </Harness>,
    )
    expect(await screen.findByText('library: empty')).toBeInTheDocument()
    rerender(
      <Harness auth={session(null, 'signed-out')}>
        <Library />
      </Harness>,
    )
    await expect(listDocuments()).rejects.toThrow(/no user store is open/i)
  })

  it('says so when the store cannot be opened, and can try again', async () => {
    const open = vi.spyOn(factory, 'open')
    open.mockImplementationOnce(() => {
      throw new DOMException('blocked', 'InvalidStateError')
    })
    render(
      <Harness auth={session('ada')}>
        <Library />
      </Harness>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn’t open your materials/i,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('library: empty')).toBeInTheDocument()
  })
})

describe('UserStoreGate legacy import', () => {
  const offer = () =>
    screen.findByRole('dialog', {
      name: 'Move the materials already on this device into your account?',
    })

  it('does not ask when there is nothing from before accounts', async () => {
    render(
      <Harness auth={session('ada')}>
        <Library />
      </Harness>,
    )
    expect(await screen.findByText('library: empty')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('moves the materials, then shows them in the library', async () => {
    await seed(DB_NAME, ['old-notes'])
    render(
      <Harness auth={session('ada')}>
        <Library />
      </Harness>,
    )
    await offer()
    // Nothing reads storage until the choice is made.
    expect(screen.queryByText(/library:/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Move them' }))

    expect(await screen.findByText('library: old-notes')).toBeInTheDocument()
    expect(await databaseNames()).not.toContain(DB_NAME)
  })

  it('keeps the legacy materials and says so when the move fails', async () => {
    await seed(DB_NAME, ['old-notes'])
    render(
      <Harness auth={session('ada')}>
        <Library />
      </Harness>,
    )
    await offer()
    // Fail the copy: the user's store is the only one written during a move.
    const fail = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementation(() => {
        throw new DOMException('full', 'QuotaExceededError')
      })
    await userEvent.click(screen.getByRole('button', { name: 'Move them' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn’t move them/i,
    )
    fail.mockRestore()
    expect(await databaseNames()).toContain(DB_NAME)
    expect(screen.getByRole('button', { name: 'Move them' })).toBeEnabled()
  })

  it('leaves them aside and does not ask that user again', async () => {
    await seed(DB_NAME, ['old-notes'])
    const { unmount } = render(
      <Harness auth={session('ada')}>
        <Library />
      </Harness>,
    )
    await offer()
    await userEvent.click(
      screen.getByRole('button', { name: 'Leave them aside' }),
    )
    expect(await screen.findByText('library: empty')).toBeInTheDocument()
    expect(localStorage.getItem('somanami-legacy-import:ada')).toBe('declined')
    unmount()

    render(
      <Harness auth={session('ada')}>
        <Library />
      </Harness>,
    )
    expect(await screen.findByText('library: empty')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // Still there for someone else to claim.
    expect(await databaseNames()).toContain(DB_NAME)
  })

  it('still offers the materials to another user after one leaves them aside', async () => {
    await seed(DB_NAME, ['old-notes'])
    localStorage.setItem('somanami-legacy-import:ada', 'declined')
    render(
      <Harness auth={session('ben')}>
        <Library />
      </Harness>,
    )
    expect(await offer()).toBeInTheDocument()
  })

  it('opens the library anyway when the legacy check gets stuck', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const open = factory.open.bind(factory)
    // An open queued behind another tab's pending delete never settles.
    vi.spyOn(factory, 'open').mockImplementation((name, version) =>
      name === DB_NAME ? ({} as IDBOpenDBRequest) : open(name, version),
    )
    render(
      <Harness auth={session('ada')}>
        <Library />
      </Harness>,
    )
    await vi.advanceTimersByTimeAsync(LEGACY_CHECK_TIMEOUT_MS)
    expect(await screen.findByText('library: empty')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('does not ask again once the materials have moved', async () => {
    await seed(DB_NAME, ['old-notes'])
    const { unmount } = render(
      <Harness auth={session('ada')}>
        <Library />
      </Harness>,
    )
    await offer()
    await userEvent.click(screen.getByRole('button', { name: 'Move them' }))
    await screen.findByText('library: old-notes')
    unmount()

    render(
      <Harness auth={session('ada')}>
        <Library />
      </Harness>,
    )
    expect(await screen.findByText('library: old-notes')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
