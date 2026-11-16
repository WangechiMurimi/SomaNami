import { createContext, useContext } from 'react'

/**
 * - `off`: nothing to sync with (no Supabase project, or signed out).
 * - `idle`: up to date as of `lastSyncedAt`, or waiting for the next run.
 * - `syncing`: a run is in progress.
 * - `offline`: the last attempt found no connection.
 * - `error`: the last run failed; it is retried on the next trigger.
 */
export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'error'

/** Why `flush` could not confirm everything reached the cloud. */
export class SyncFlushError extends Error {
  readonly reason: 'offline' | 'failed'

  constructor(reason: 'offline' | 'failed', options?: { cause?: unknown }) {
    super(
      reason === 'offline'
        ? 'Changes can’t be saved without a connection'
        : 'Changes couldn’t be saved',
      options,
    )
    this.name = 'SyncFlushError'
    this.reason = reason
  }
}

export interface SyncContextValue {
  status: SyncStatus
  /** Local changes not yet confirmed by the cloud. */
  pending: number
  lastSyncedAt: number | null
  /**
   * Pushes everything now and resolves once the cloud has confirmed it all.
   * Rejects with `SyncFlushError` if that can't be confirmed, so sign-out
   * never clears a device that still holds unsaved changes.
   */
  flush(): Promise<void>
  /** Starts a run soon, e.g. after a user action. */
  syncNow(): void
}

const OFF: SyncContextValue = {
  status: 'off',
  pending: 0,
  lastSyncedAt: null,
  // Nothing to save to, so nothing is waiting.
  flush: async () => {},
  syncNow: () => {},
}

export const SyncContext = createContext<SyncContextValue>(OFF)

/** The sync state and controls; `off` outside a `SyncProvider`. */
export function useSync(): SyncContextValue {
  return useContext(SyncContext)
}

export { OFF as SYNC_OFF }
