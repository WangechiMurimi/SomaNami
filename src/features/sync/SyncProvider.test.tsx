import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMemoryAdapter,
  createWorkspace,
  listOutbox,
  setStorageAdapter,
} from '../../lib/storage/index.ts'
import type { CloudStore } from '../../lib/sync/cloud.ts'
import { createMemoryCloud } from '../../lib/sync/testing/memory-cloud.ts'
import type { AuthContextValue } from '../../types/auth.ts'
import { AuthContext } from '../auth/auth-context.ts'
import SyncProvider from './SyncProvider.tsx'
import { SyncFlushError, useSync } from './sync-context.ts'
import type { SyncContextValue } from './sync-context.ts'

const auth = {
  status: 'signed-in',
  user: { id: 'user-a', email: 'a@example.test' },
} as unknown as AuthContextValue

// The latest context value, handed out by the probe for tests to call.
let sync: SyncContextValue
const keep = (value: SyncContextValue) => {
  sync = value
}

function Probe({ onSync }: { onSync: (value: SyncContextValue) => void }) {
  const value = useSync()
  // During render, so tests see the value before effects or waits.
  onSync(value)
  return <p data-testid="status">{value.status}</p>
}

function renderSync(cloud: CloudStore | null) {
  return render(
    <AuthContext.Provider value={auth}>
      <SyncProvider cloud={cloud} intervalMs={60_000} afterChangeMs={10}>
        <Probe onSync={keep} />
      </SyncProvider>
    </AuthContext.Provider>,
  )
}

const setOnline = (online: boolean) =>
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)

let cloud: ReturnType<typeof createMemoryCloud>

beforeEach(() => {
  setStorageAdapter(createMemoryAdapter())
  cloud = createMemoryCloud()
})

afterEach(() => {
  vi.restoreAllMocks()
  setStorageAdapter(null)
})

describe('SyncProvider', () => {
  it('syncs as soon as it mounts', async () => {
    await createWorkspace({ name: 'Biology' })

    renderSync(cloud.cloud)

    await waitFor(() => expect(cloud.rows('workspaces')).toHaveLength(1))
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('idle'),
    )
    expect(sync.lastSyncedAt).not.toBeNull()
  })

  it('syncs shortly after a local change', async () => {
    renderSync(cloud.cloud)
    await waitFor(() => expect(sync.lastSyncedAt).not.toBeNull())

    await act(() => createWorkspace({ name: 'Chemistry' }))

    await waitFor(() =>
      expect(cloud.rows('workspaces').map((r) => r.name)).toEqual([
        'Chemistry',
      ]),
    )
  })

  it('flush resolves only once everything is confirmed', async () => {
    renderSync(cloud.cloud)
    await createWorkspace({ name: 'Biology' })

    await act(() => sync.flush())

    expect(await listOutbox()).toEqual([])
    expect(cloud.rows('workspaces')).toHaveLength(1)
  })

  it('flush rejects offline, keeping the changes', async () => {
    renderSync(cloud.cloud)
    await waitFor(() => expect(sync.lastSyncedAt).not.toBeNull())
    await createWorkspace({ name: 'Biology' })
    setOnline(false)

    let failure: unknown
    await act(async () => {
      failure = await sync.flush().catch((error: unknown) => error)
    })

    expect(failure).toBeInstanceOf(SyncFlushError)
    expect(failure).toMatchObject({ reason: 'offline' })
    expect(await listOutbox()).toHaveLength(1)
    expect(screen.getByTestId('status')).toHaveTextContent('offline')
  })

  it('flush rejects when the cloud fails, and reports an error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderSync(cloud.cloud)
    await waitFor(() => expect(sync.lastSyncedAt).not.toBeNull())
    await createWorkspace({ name: 'Biology' })
    cloud.failNext('upsert', new Error('server down'))

    let failure: unknown
    await act(async () => {
      failure = await sync.flush().catch((error: unknown) => error)
    })

    expect(failure).toMatchObject({ reason: 'failed' })
    expect(screen.getByTestId('status')).toHaveTextContent('error')
    // Only the error's class is logged, never request details.
    expect(console.error).toHaveBeenCalledWith('Sync failed', 'Error')
  })

  it('catches up when the connection comes back', async () => {
    setOnline(false)
    await createWorkspace({ name: 'Biology' })
    renderSync(cloud.cloud)
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('offline'),
    )

    setOnline(true)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    await waitFor(() => expect(cloud.rows('workspaces')).toHaveLength(1))
  })

  it('is off without a cloud, and flush has nothing to wait for', async () => {
    renderSync(null)
    expect(screen.getByTestId('status')).toHaveTextContent('off')
    await expect(sync.flush()).resolves.toBeUndefined()
  })
})
