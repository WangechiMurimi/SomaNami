import type {
  Conversation,
  Message,
  StoredDocument,
  Workspace,
} from '../../types/contracts.ts'
import {
  acknowledgeOutbox,
  applyPulled,
  applyPulledDeletion,
  getDocument,
  getSyncMeta,
  getSyncedRecord,
  listOutbox,
  setSyncMeta,
} from '../storage/index.ts'
import type { OutboxEntry, PulledRecord } from '../storage/index.ts'
import { MissingParentError } from './cloud.ts'
import type { CloudStore, CloudTable, Cursor, Row } from './cloud.ts'
import {
  chunksToRows,
  conversationToRow,
  documentToRow,
  messageToRow,
  rowToChunk,
  rowToConversation,
  rowToDocument,
  rowToMessage,
  rowToWorkspace,
  workspaceToRow,
} from './mapping.ts'

/** Parents before children, so a row's parent is always written first. */
const PARENT_FIRST: readonly CloudTable[] = [
  'workspaces',
  'documents',
  'conversations',
  'messages',
]
const CHILD_FIRST = [...PARENT_FIRST].reverse()

const PAGE = 500
const BATCH = 100
const CHUNK_BATCH = 200
/**
 * Each pull re-reads this much before its cursor. A write that started
 * before another but committed after it can carry an older
 * server_updated_at; re-reading a window catches it, and applying the same
 * row twice is harmless.
 */
export const PULL_OVERLAP_MS = 10_000

const cursorKey = (name: string) => `cursor:${name}`

export interface SyncResult {
  pulled: number
  pushed: number
  /** Changes still waiting, e.g. made while this run was in flight. */
  pending: number
}

/**
 * One full sync: pull deletions, pull changes, then push this device's
 * outbox. Pulling first means a record deleted elsewhere is removed here
 * before a stale local edit to it could be pushed. Progress is saved as it
 * goes, so a failure partway (offline, say) loses nothing: the next run picks
 * up where this one stopped. Rejects on any error other than a missing parent.
 */
export async function syncOnce(cloud: CloudStore): Promise<SyncResult> {
  const pulled = (await pullDeletions(cloud)) + (await pullChanges(cloud))
  const pushed = await pushOutbox(cloud)
  const pending = (await listOutbox()).length
  return { pulled, pushed, pending }
}

// ── Pull ───────────────────────────────────────────────────────────────────

async function startOf(name: string): Promise<{ from: Cursor; at: number }> {
  const at = (await getSyncMeta<number>(cursorKey(name))) ?? 0
  return { from: { at: Math.max(0, at - PULL_OVERLAP_MS), id: '' }, at }
}

async function pullDeletions(cloud: CloudStore): Promise<number> {
  let { from, at } = await startOf('deletions')
  let count = 0
  for (;;) {
    const rows = await cloud.pullDeletions(from, PAGE)
    for (const row of rows) {
      if (await applyPulledDeletion(row.record_type, row.record_id)) count += 1
      at = Math.max(at, row.server_updated_at)
    }
    await setSyncMeta(cursorKey('deletions'), at)
    if (rows.length < PAGE) return count
    const last = rows[rows.length - 1]!
    from = { at: last.server_updated_at, id: last.record_id }
  }
}

async function pullChanges(cloud: CloudStore): Promise<number> {
  let count = 0
  for (const table of PARENT_FIRST) {
    let { from, at } = await startOf(table)
    for (;;) {
      const rows = await cloud.pull(table, from, PAGE)
      if (rows.length > 0) {
        count += await applyPulled(table, await toRecords(cloud, table, rows))
      }
      for (const row of rows) at = Math.max(at, row.server_updated_at)
      await setSyncMeta(cursorKey(table), at)
      if (rows.length < PAGE) break
      const last = rows[rows.length - 1]!
      from = { at: last.server_updated_at, id: last.id }
    }
  }
  return count
}

// The project targets ES2023, which predates Map.groupBy.
function groupBy<T>(items: readonly T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const group = groups.get(k)
    if (group) group.push(item)
    else groups.set(k, [item])
  }
  return groups
}

// Device records are plain objects; the storage layer reads them loosely.
const asPulled = (record: object) => record as unknown as PulledRecord

/** Turns pulled rows into device records, fetching chunks and materials as needed. */
async function toRecords(
  cloud: CloudStore,
  table: CloudTable,
  rows: readonly Row[],
): Promise<PulledRecord[]> {
  if (table === 'workspaces')
    return rows.map((r) => asPulled(rowToWorkspace(r)))
  if (table === 'messages') return rows.map((r) => asPulled(rowToMessage(r)))

  if (table === 'documents') {
    // Chunks never change, so only fetch them for documents this device lacks.
    const missing: string[] = []
    for (const row of rows)
      if (!(await getDocument(row.id))) missing.push(row.id)
    const chunks = missing.length > 0 ? await cloud.chunksFor(missing) : []
    const byDocument = groupBy(chunks, (chunk) => chunk.document_id)
    return rows.map((row) => {
      const document = asPulled(rowToDocument(row))
      if (missing.includes(row.id)) {
        document.chunks = (byDocument.get(row.id) ?? [])
          .sort((a, b) => a.position - b.position)
          .map(rowToChunk)
      }
      return document
    })
  }

  const materials = await cloud.materialsFor(rows.map((row) => row.id))
  const byConversation = groupBy(materials, (m) => m.conversation_id)
  return rows.map((row) =>
    asPulled(
      rowToConversation(
        row,
        (byConversation.get(row.id) ?? []).map((m) => m.document_id),
      ),
    ),
  )
}

// ── Push ───────────────────────────────────────────────────────────────────

const batches = <T>(items: readonly T[], size: number): T[][] => {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size)
    result.push(items.slice(i, i + size))
  return result
}

const TO_ROW: Record<CloudTable, (record: never) => Row> = {
  workspaces: (record: Workspace) => workspaceToRow(record),
  documents: (record: StoredDocument) => documentToRow(record),
  conversations: (record: Conversation) => conversationToRow(record),
  messages: (record: Message) => messageToRow(record),
}

async function pushOutbox(cloud: CloudStore): Promise<number> {
  const entries = await listOutbox()
  let pushed = 0
  for (const table of PARENT_FIRST) {
    const upserts = entries.filter(
      (e) => e.recordType === table && e.op === 'upsert',
    )
    for (const batch of batches(upserts, BATCH)) {
      pushed += await pushUpserts(cloud, table, batch)
    }
  }
  for (const table of CHILD_FIRST) {
    const deletes = entries.filter(
      (e) => e.recordType === table && e.op === 'delete',
    )
    for (const batch of batches(deletes, BATCH)) {
      pushed += await pushDeletes(cloud, table, batch)
    }
  }
  return pushed
}

async function pushUpserts(
  cloud: CloudStore,
  table: CloudTable,
  entries: readonly OutboxEntry[],
): Promise<number> {
  const records = new Map<string, unknown>()
  for (const entry of entries) {
    // Read now, not when queued: the latest copy is what should win.
    const record = await getSyncedRecord(table, entry.recordId)
    if (record) records.set(entry.recordId, record)
  }
  const rows = [...records.values()].map((record) =>
    TO_ROW[table](record as never),
  )
  const written = new Set(await upsertSkippingOrphans(cloud, table, rows))

  for (const id of written) {
    const record = records.get(id)
    if (table === 'documents') {
      for (const chunk of batches(
        chunksToRows(record as StoredDocument),
        CHUNK_BATCH,
      )) {
        await cloud.insertChunks(chunk)
      }
    } else if (table === 'conversations') {
      const { materialIds } = record as Conversation
      await cloud.setConversationMaterials(id, materialIds)
    }
  }

  // Everything in the batch is settled: written; skipped by the server as
  // stale or deleted (the next pull brings the winning copy); or orphaned
  // because its parent was deleted elsewhere (the next pull removes it here).
  let acknowledged = 0
  for (const entry of entries) {
    if (await acknowledgeOutbox(entry)) acknowledged += 1
  }
  return acknowledged
}

/**
 * Upserts rows; if a parent is missing, retries one by one and leaves out the
 * orphans instead of failing the whole batch forever.
 */
async function upsertSkippingOrphans(
  cloud: CloudStore,
  table: CloudTable,
  rows: readonly Row[],
): Promise<string[]> {
  if (rows.length === 0) return []
  try {
    return await cloud.upsert(table, rows)
  } catch (error) {
    if (!(error instanceof MissingParentError)) throw error
  }
  const written: string[] = []
  for (const row of rows) {
    try {
      written.push(...(await cloud.upsert(table, [row])))
    } catch (error) {
      if (!(error instanceof MissingParentError)) throw error
    }
  }
  return written
}

async function pushDeletes(
  cloud: CloudStore,
  table: CloudTable,
  entries: readonly OutboxEntry[],
): Promise<number> {
  const ids = entries.map((entry) => entry.recordId)
  // Files first: if a later step fails, no file is left without a row
  // pointing at it, and the retry finds the row and tries again.
  if (table === 'documents') await cloud.removeOriginals(ids)
  // The deletion is recorded before the rows go, so a device that pushes a
  // stale copy in between is still refused.
  await cloud.recordDeletions(
    entries.map((entry) => ({
      record_type: table,
      record_id: entry.recordId,
      deleted_at: entry.updatedAt,
    })),
  )
  await cloud.remove(table, ids)
  let acknowledged = 0
  for (const entry of entries) {
    if (await acknowledgeOutbox(entry)) acknowledged += 1
  }
  return acknowledged
}
