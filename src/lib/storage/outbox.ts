/**
 * The outbox: local changes waiting to be pushed to Supabase (#146).
 *
 * Every write in `index.ts` adds outbox entries in the same `commit` as the
 * records they describe, so a change is never stored without its entry (or
 * the reverse). Entry format:
 *
 *   { id, recordType, recordId, op, updatedAt, seq }
 *
 * - `recordType` is the local store, which has the same name as the cloud
 *   table: `workspaces`, `documents`, `conversations` or `messages`. A
 *   document's chunks and a conversation's `materialIds` travel with it.
 * - `op` is `upsert` (read the record's current local copy and push it) or
 *   `delete` (a tombstone). Entries carry ids only, never content, so the
 *   pusher always sends the latest copy and a tombstone holds nothing private.
 * - `updatedAt` is the client time of the change, for last-write-wins: the
 *   record's `updatedAt` (a message's `createdAt`) for an upsert, the time of
 *   removal for a delete.
 * - `seq` orders entries: it increases with every entry this tab makes and
 *   tracks the clock, so entries from different tabs interleave by time.
 * - `id` is `<recordType>:<recordId>`, so a record has at most one entry and
 *   a newer change replaces the older one. A delete replaces a pending upsert.
 *
 * A pusher should send upserts parent first (workspaces, documents,
 * conversations, messages) and deletes child first, then remove each entry it
 * pushed only if its `seq` is unchanged: a different `seq` means the record
 * changed again while the push was in flight.
 *
 * Records stored before v3 have entries seeded by the v2→v3 migration, so
 * every local record the cloud may not have yet has an entry.
 */
import type { Change } from './adapter.ts'
import { OUTBOX } from './schema.ts'
import type { SyncedStoreName } from './schema.ts'

export type OutboxOperation = 'upsert' | 'delete'

/** One pending change to push. See the module comment for the format. */
export interface OutboxEntry {
  id: string
  recordType: SyncedStoreName
  recordId: string
  op: OutboxOperation
  updatedAt: number
  seq: number
}

let lastSeq = 0

/** The next ordering number: the clock, but never repeating or going back. */
export function nextSeq(now: number = Date.now()): number {
  lastSeq = Math.max(now, lastSeq + 1)
  return lastSeq
}

/** Builds the outbox entry for one change to one record. */
export function outboxEntry(
  recordType: SyncedStoreName,
  recordId: string,
  op: OutboxOperation,
  updatedAt: number,
): OutboxEntry {
  return {
    id: `${recordType}:${recordId}`,
    recordType,
    recordId,
    op,
    updatedAt,
    seq: nextSeq(),
  }
}

/** The client time an upsert carries: `updatedAt`, or `createdAt` for messages. */
export function changedAt(record: {
  updatedAt?: unknown
  createdAt?: unknown
}): number {
  // Typed loosely because migrated records arrive untyped from IndexedDB.
  if (typeof record.updatedAt === 'number') return record.updatedAt
  if (typeof record.createdAt === 'number') return record.createdAt
  return Date.now()
}

/** Stores `record` and queues it for upload, as two changes for one commit. */
export function upsert(
  storeName: SyncedStoreName,
  record: { id: string; updatedAt?: number; createdAt?: number },
): Change[] {
  return [
    { type: 'put', storeName, record },
    {
      type: 'put',
      storeName: OUTBOX,
      record: outboxEntry(storeName, record.id, 'upsert', changedAt(record)),
    },
  ]
}

/** Removes a record and leaves a tombstone, as two changes for one commit. */
export function tombstone(
  storeName: SyncedStoreName,
  id: string,
  deletedAt: number,
): Change[] {
  return [
    { type: 'remove', storeName, key: id },
    {
      type: 'put',
      storeName: OUTBOX,
      record: outboxEntry(storeName, id, 'delete', deletedAt),
    },
  ]
}
