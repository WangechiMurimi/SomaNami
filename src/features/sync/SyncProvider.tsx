import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { getSupabaseClient } from '../../lib/auth/supabase-client.ts'
import {
  isOnline,
  subscribeToConnectivity,
} from '../../lib/connectivity/use-online.ts'
import {
  listOutbox,
  subscribeToConversations,
  subscribeToDocuments,
  subscribeToWorkspaces,
} from '../../lib/storage/index.ts'
import type { CloudStore } from '../../lib/sync/cloud.ts'
import { syncOnce } from '../../lib/sync/engine.ts'
import type { SyncResult } from '../../lib/sync/engine.ts'
import { createSupabaseCloud } from '../../lib/sync/supabase-cloud.ts'
import { useAuth } from '../auth/auth-context.ts'
import { SYNC_OFF, SyncContext, SyncFlushError } from './sync-context.ts'
import type { SyncContextValue, SyncStatus } from './sync-context.ts'

const INTERVAL_MS = 60_000
/** Lets a burst of edits (a document and its conversation) go up together. */
const AFTER_CHANGE_MS = 1_500

export interface SyncProviderProps {
  children: ReactNode
  /** Test seam: the cloud to sync with. Defaults to Supabase. */
  cloud?: CloudStore | null
  intervalMs?: number
  afterChangeMs?: number
}

/**
 * Keeps this device and the cloud in step (#146): syncs when the store opens,
 * on an interval, when the connection comes back, and shortly after a local
 * change. Runs never overlap. Mount it below `UserStoreGate`, since it reads
 * the signed-in user's store.
 */
export default function SyncProvider({
  children,
  cloud: injected,
  intervalMs = INTERVAL_MS,
  afterChangeMs = AFTER_CHANGE_MS,
}: SyncProviderProps) {
  const { user } = useAuth()
  const userId = user?.id
  const cloud = useMemo(() => {
    if (injected !== undefined) return injected
    const client = getSupabaseClient()
    return client && userId ? createSupabaseCloud(client, userId) : null
  }, [injected, userId])

  if (!cloud) {
    return (
      <SyncContext.Provider value={SYNC_OFF}>{children}</SyncContext.Provider>
    )
  }
  return (
    <ActiveSync
      cloud={cloud}
      intervalMs={intervalMs}
      afterChangeMs={afterChangeMs}
    >
      {children}
    </ActiveSync>
  )
}

function ActiveSync({
  children,
  cloud,
  intervalMs,
  afterChangeMs,
}: {
  children: ReactNode
  cloud: CloudStore
  intervalMs: number
  afterChangeMs: number
}) {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [pending, setPending] = useState(0)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const mounted = useRef(true)
  // The run in progress, if any; a request during it waits for one more.
  const current = useRef<Promise<SyncResult> | null>(null)
  const queued = useRef<Promise<SyncResult> | null>(null)

  const runOnce = useCallback(async (): Promise<SyncResult> => {
    if (!isOnline()) {
      if (mounted.current) setStatus('offline')
      throw new SyncFlushError('offline')
    }
    if (mounted.current) setStatus('syncing')
    try {
      const result = await syncOnce(cloud)
      if (mounted.current) {
        setPending(result.pending)
        setLastSyncedAt(Date.now())
        setStatus('idle')
      }
      return result
    } catch (error) {
      if (mounted.current) {
        setStatus(isOnline() ? 'error' : 'offline')
        // The class only: errors can carry request details.
        console.error('Sync failed', (error as Error)?.name)
      }
      throw new SyncFlushError(isOnline() ? 'failed' : 'offline', {
        cause: error,
      })
    }
  }, [cloud])

  /** Starts a run, or joins the one queued behind the current run. */
  const run = useCallback((): Promise<SyncResult> => {
    if (!current.current) {
      current.current = runOnce().finally(() => {
        current.current = queued.current
        queued.current = null
      })
      return current.current
    }
    // Changes made during a run may have missed it, so one more follows.
    queued.current ??= current.current
      .catch(() => undefined)
      .then(() => runOnce())
    return queued.current
  }, [runOnce])

  const runQuietly = useCallback(() => {
    // Failures are already reflected in `status`, and retried on a trigger.
    run().catch(() => undefined)
  }, [run])

  useEffect(() => {
    mounted.current = true
    runQuietly()
    const interval = setInterval(runQuietly, intervalMs)
    const offConnectivity = subscribeToConnectivity(() => {
      if (isOnline()) runQuietly()
      else setStatus('offline')
    })

    let timer: ReturnType<typeof setTimeout> | undefined
    const afterChange = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        // Pulled records fire the same signals; only real local work runs.
        const outbox = await listOutbox().catch(() => [])
        if (!mounted.current) return
        setPending(outbox.length)
        if (outbox.length > 0) runQuietly()
      }, afterChangeMs)
    }
    const unsubscribers = [
      subscribeToDocuments(afterChange),
      subscribeToWorkspaces(afterChange),
      subscribeToConversations(afterChange),
    ]

    return () => {
      mounted.current = false
      clearInterval(interval)
      clearTimeout(timer)
      offConnectivity()
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [runQuietly, intervalMs, afterChangeMs])

  const flush = useCallback(async () => {
    let result = await run()
    // A change made during that run is still waiting; give it one more.
    if (result.pending > 0) result = await run()
    if (result.pending > 0) throw new SyncFlushError('failed')
  }, [run])

  const value = useMemo<SyncContextValue>(
    () => ({ status, pending, lastSyncedAt, flush, syncNow: runQuietly }),
    [status, pending, lastSyncedAt, flush, runQuietly],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}
