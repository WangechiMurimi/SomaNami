/*
 * Local storage as the sync engine (src/lib/sync/engine.ts) sees it: the
 * outbox, sync bookkeeping and pulled records. Re-exported from index.ts.
 */
import { store } from './active-store.ts'
import { changedAt } from './outbox.ts'
import type { OutboxEntry } from './outbox.ts'
import {
  CONVERSATIONS,
  DOCUMENTS,
  MESSAGES,
  OUTBOX,
  SYNC_META,
  WORKSPACES,
} from './schema.ts'
import type { SyncedStoreName } from './schema.ts'
import {
  notifyConversations,
  notifyDocuments,
  notifyWorkspaces,
} from './signals.ts'

/** The changes waiting to be pushed, oldest first (see `outbox.ts`). */
export async function listOutbox(): Promise<OutboxEntry[]> {
  const entries = await store().getAll<OutboxEntry>(OUTBOX)
  return entries.sort((a, b) => a.seq - b.seq)
}

/** Reads one local record of a synced store, for the pusher to send. */
export async function getSyncedRecord<T extends { id: string }>(
  storeName: SyncedStoreName,
  id: string,
): Promise<T | undefined> {
  return store().get<T>(storeName, id)
}

/**
 * Removes a pushed entry, unless the record changed again while the push was
 * in flight (its `seq` moved on): then the newer change stays queued.
 * Resolves to whether the entry was removed.
 */
export async function acknowledgeOutbox(entry: OutboxEntry): Promise<boolean> {
  return store().guardedCommit(
    [{ storeName: OUTBOX, key: entry.id, field: 'seq', equals: entry.seq }],
    [{ type: 'remove', storeName: OUTBOX, key: entry.id }],
  )
}

interface SyncMetaRecord {
  id: string
  value: unknown
}

/** A value the sync engine keeps between runs, such as a pull cursor. */
export async function getSyncMeta<T>(key: string): Promise<T | undefined> {
  const record = await store().get<SyncMetaRecord>(SYNC_META, key)
  return record?.value as T | undefined
}

export async function setSyncMeta(key: string, value: unknown): Promise<void> {
  await store().put<SyncMetaRecord>(SYNC_META, { id: key, value })
}

/** A record as the engine pulls it: the local shape, typed loosely at runtime. */
export interface PulledRecord {
  id: string
  createdAt?: unknown
  updatedAt?: unknown
  chunks?: unknown
  [field: string]: unknown
}

const NOTIFY: Record<SyncedStoreName, () => void> = {
  [WORKSPACES]: () => notifyWorkspaces(),
  [DOCUMENTS]: () => notifyDocuments(),
  [CONVERSATIONS]: () => notifyConversations(),
  [MESSAGES]: () => notifyConversations(),
}

/**
 * Stores records pulled from the cloud, without queueing them for upload.
 * Last write wins: a record with a pending local change is only replaced if
 * the pulled copy is newer, and then the local change is dropped. A pulled
 * document without chunks keeps the local copy's chunks, since chunks never
 * change. Every check and write happens in one transaction per record, so an
 * edit made meanwhile is never overwritten. Resolves to how many were stored.
 */
export async function applyPulled(
  storeName: SyncedStoreName,
  records: readonly PulledRecord[],
): Promise<number> {
  const db = store()
  let applied = 0
  for (const record of records) {
    const outboxKey = `${storeName}:${record.id}`
    const [entry, local] = await Promise.all([
      db.get<OutboxEntry>(OUTBOX, outboxKey),
      db.get<PulledRecord>(storeName, record.id),
    ])
    const pulledAt = changedAt(record)
    let incoming = record
    if (storeName === DOCUMENTS && !Array.isArray(record.chunks)) {
      // The engine only fetches chunks for documents this device lacks.
      if (!local) continue
      incoming = { ...record, chunks: local.chunks }
    }

    if (entry) {
      // A local delete or a newer local edit wins and will be pushed.
      if (entry.op === 'delete' || entry.updatedAt >= pulledAt) continue
      const stored = await db.guardedCommit(
        [
          {
            storeName: OUTBOX,
            key: outboxKey,
            field: 'seq',
            equals: entry.seq,
          },
        ],
        [
          { type: 'put', storeName, record: incoming },
          { type: 'remove', storeName: OUTBOX, key: outboxKey },
        ],
      )
      if (stored) applied += 1
      continue
    }

    // Already up to date (pulls overlap, so the same copy can arrive twice).
    if (local && changedAt(local) >= pulledAt) continue
    const stored = await db.guardedCommit(
      [{ storeName: OUTBOX, key: outboxKey, field: 'seq', equals: undefined }],
      [{ type: 'put', storeName, record: incoming }],
    )
    if (stored) applied += 1
  }
  if (applied > 0) NOTIFY[storeName]()
  return applied
}
