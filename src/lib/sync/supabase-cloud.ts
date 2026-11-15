import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { MATERIALS_BUCKET } from '../storage-cloud/originals.ts'
import { MissingParentError } from './cloud.ts'
import type {
  ChunkRow,
  CloudStore,
  CloudTable,
  Cursor,
  MaterialRow,
  PulledDeletion,
  PulledRow,
} from './cloud.ts'

/** Postgres' foreign key violation: the parent row is gone. */
const FOREIGN_KEY_VIOLATION = '23503'
// Ids go in the URL for `in` filters, so keep each request's list short.
const IDS_PER_REQUEST = 50
// Supabase caps a response at 1000 rows by default.
const ROWS_PER_PAGE = 1000

const chunked = <T>(items: readonly T[], size: number): T[][] => {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size)
    result.push(items.slice(i, i + size))
  return result
}

function check(error: PostgrestError | null): void {
  if (!error) return
  if (error.code === FOREIGN_KEY_VIOLATION) throw new MissingParentError()
  throw new Error(`Sync request failed (${error.code || 'network'})`, {
    cause: error,
  })
}

/** Quotes a value for a PostgREST filter, so ids with commas or dots are safe. */
const quoted = (value: string) =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** `(server_updated_at, column)` strictly after the cursor. */
const afterCursor = (cursor: Cursor, column: string) =>
  `server_updated_at.gt.${cursor.at},and(server_updated_at.eq.${cursor.at},${column}.gt.${quoted(cursor.id)})`

/**
 * The cloud as the signed-in learner sees it. Every request runs with their
 * session, so row-level security applies; the service-role key is never
 * used in the browser.
 */
export function createSupabaseCloud(
  client: SupabaseClient,
  userId: string,
): CloudStore {
  const owned = <T extends object>(rows: readonly T[]) =>
    rows.map((row) => ({ ...row, user_id: userId }))

  /** Reads every page of a filtered query; `build` applies the filters. */
  async function allPages<T>(
    build: (
      from: number,
      to: number,
    ) => PromiseLike<{
      data: T[] | null
      error: PostgrestError | null
    }>,
  ): Promise<T[]> {
    const rows: T[] = []
    for (let from = 0; ; from += ROWS_PER_PAGE) {
      const { data, error } = await build(from, from + ROWS_PER_PAGE - 1)
      check(error)
      rows.push(...(data ?? []))
      if (!data || data.length < ROWS_PER_PAGE) return rows
    }
  }

  return {
    async upsert(table, rows) {
      if (rows.length === 0) return []
      // Only rows the server actually wrote come back: its triggers skip a
      // stale update or a deleted record by returning no row.
      const { data, error } = await client
        .from(table)
        .upsert(owned(rows), { onConflict: 'user_id,id' })
        .select('id')
      check(error)
      return (data ?? []).map((row: { id: string }) => row.id)
    },

    async insertChunks(rows) {
      if (rows.length === 0) return
      const { error } = await client.from('chunks').upsert(owned(rows), {
        onConflict: 'user_id,id',
        ignoreDuplicates: true,
      })
      check(error)
    },

    async setConversationMaterials(conversationId, documentIds) {
      let removal = client
        .from('conversation_materials')
        .delete()
        .eq('conversation_id', conversationId)
      if (documentIds.length > 0) {
        removal = removal.not(
          'document_id',
          'in',
          `(${documentIds.map(quoted).join(',')})`,
        )
      }
      check((await removal).error)
      if (documentIds.length === 0) return

      const rows = owned(
        documentIds.map((documentId) => ({
          conversation_id: conversationId,
          document_id: documentId,
        })),
      )
      const insert = (batch: typeof rows) =>
        client.from('conversation_materials').upsert(batch, {
          onConflict: 'user_id,conversation_id,document_id',
          ignoreDuplicates: true,
        })
      const { error } = await insert(rows)
      if (error?.code !== FOREIGN_KEY_VIOLATION) return check(error)
      // A material was deleted elsewhere: keep the rest.
      for (const row of rows) {
        const { error: rowError } = await insert([row])
        if (rowError?.code !== FOREIGN_KEY_VIOLATION) check(rowError)
      }
    },

    async recordDeletions(rows) {
      if (rows.length === 0) return
      const { error } = await client
        .from('deletions')
        .upsert(owned(rows), { onConflict: 'user_id,record_type,record_id' })
      check(error)
    },

    async remove(table, ids) {
      for (const batch of chunked(ids, IDS_PER_REQUEST)) {
        const { error } = await client.from(table).delete().in('id', batch)
        check(error)
      }
    },

    async removeOriginals(documentIds) {
      const bucket = client.storage.from(MATERIALS_BUCKET)
      for (const documentId of documentIds) {
        // The whole folder, not just the recorded path: an upload whose path
        // was never saved still goes.
        const folder = `${userId}/${documentId}`
        const { data, error } = await bucket.list(folder, { limit: 100 })
        if (error) throw new Error('Listing originals failed', { cause: error })
        const paths = (data ?? []).map((file) => `${folder}/${file.name}`)
        if (paths.length === 0) continue
        const removed = await bucket.remove(paths)
        if (removed.error) {
          throw new Error('Removing originals failed', { cause: removed.error })
        }
      }
    },

    async pull(table: CloudTable, cursor, limit) {
      const { data, error } = await client
        .from(table)
        .select('*')
        .or(afterCursor(cursor, 'id'))
        .order('server_updated_at')
        .order('id')
        .limit(limit)
      check(error)
      return (data ?? []) as PulledRow[]
    },

    async pullDeletions(cursor, limit) {
      const { data, error } = await client
        .from('deletions')
        .select('record_type, record_id, deleted_at, server_updated_at')
        .or(afterCursor(cursor, 'record_id'))
        .order('server_updated_at')
        .order('record_id')
        .limit(limit)
      check(error)
      return (data ?? []) as PulledDeletion[]
    },

    async chunksFor(documentIds) {
      const rows: ChunkRow[] = []
      for (const batch of chunked(documentIds, IDS_PER_REQUEST)) {
        rows.push(
          ...(await allPages<ChunkRow>((from, to) =>
            client
              .from('chunks')
              .select('id, document_id, position, text, source')
              .in('document_id', batch)
              .order('document_id')
              .order('position')
              .range(from, to),
          )),
        )
      }
      return rows
    },

    async materialsFor(conversationIds) {
      const rows: MaterialRow[] = []
      for (const batch of chunked(conversationIds, IDS_PER_REQUEST)) {
        rows.push(
          ...(await allPages<MaterialRow>((from, to) =>
            client
              .from('conversation_materials')
              .select('conversation_id, document_id')
              .in('conversation_id', batch)
              .order('conversation_id')
              .order('document_id')
              .range(from, to),
          )),
        )
      }
      return rows
    },
  }
}
