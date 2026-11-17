/**
 * What the sync engine needs from the cloud, and nothing more (#146). The app
 * uses `createSupabaseCloud`; tests use the in-memory fake in `testing/`,
 * which enforces the same server rules as the migrations.
 *
 * Rows are the tables' snake_case shape without `user_id`: an implementation
 * adds the signed-in user's id, and RLS refuses any other.
 */

import type { SyncedStoreName } from '../storage/schema.ts'

/** The synced tables, which share their names with the local stores. */
export type CloudTable = SyncedStoreName

export type Row = Record<string, unknown> & { id: string }

export interface ChunkRow {
  id: string
  document_id: string
  position: number
  text: string
  source: unknown
}

export interface MaterialRow {
  conversation_id: string
  document_id: string
}

export interface DeletionRow {
  record_type: CloudTable
  record_id: string
  deleted_at: number
}

/**
 * Where a pull resumes: rows are read in `(server_updated_at, id)` order, so
 * rows sharing a millisecond are never skipped at a page boundary.
 */
export interface Cursor {
  at: number
  id: string
}

export interface PulledRow extends Row {
  server_updated_at: number
}

export interface PulledDeletion extends DeletionRow {
  server_updated_at: number
}

/** A write refused because its parent row no longer exists (deleted elsewhere). */
export class MissingParentError extends Error {
  constructor(message = 'The parent record no longer exists') {
    super(message)
    this.name = 'MissingParentError'
  }
}

export interface CloudStore {
  /**
   * Upserts rows and resolves to the ids the server actually wrote: it skips
   * an update older than the stored row, and a record deleted elsewhere.
   * Rejects with `MissingParentError` if any row's parent is gone.
   */
  upsert(table: CloudTable, rows: readonly Row[]): Promise<string[]>
  /** Adds chunks; ones already stored are left alone, since chunks never change. */
  insertChunks(rows: readonly ChunkRow[]): Promise<void>
  /** Makes a conversation's material rows exactly `documentIds`, skipping deleted documents. */
  setConversationMaterials(
    conversationId: string,
    documentIds: readonly string[],
  ): Promise<void>
  /** Records deletions so other devices pull them. Retrying is safe. */
  recordDeletions(rows: readonly DeletionRow[]): Promise<void>
  /** Deletes rows; their children go with them. Missing rows are fine. */
  remove(table: CloudTable, ids: readonly string[]): Promise<void>
  /** Deletes every uploaded file under each document's folder. */
  removeOriginals(documentIds: readonly string[]): Promise<void>
  /** Rows written after `after`, oldest first. */
  pull(table: CloudTable, after: Cursor, limit: number): Promise<PulledRow[]>
  /** Deletions recorded after `after`, oldest first (`id` is the record id). */
  pullDeletions(after: Cursor, limit: number): Promise<PulledDeletion[]>
  /** Every chunk of these documents, in position order. */
  chunksFor(documentIds: readonly string[]): Promise<ChunkRow[]>
  /** Every material row of these conversations. */
  materialsFor(conversationIds: readonly string[]): Promise<MaterialRow[]>
  /**
   * Deletes everything the learner has stored (#147): every row and every
   * uploaded file. Deletions are recorded first, so another device can't
   * upload a stale copy back while this runs, and files go before rows, so
   * a failure partway never leaves a file nothing points at. Safe to retry.
   */
  eraseEverything(): Promise<void>
}
