import type { StoreName } from './schema.ts'

/** Every stored record is keyed by a string `id`. */
export interface StorageRecord {
  id: string
}

/** One write in a `commit`: store a record, or delete one by key. */
export type Change =
  | { type: 'put'; storeName: StoreName; record: StorageRecord }
  | { type: 'remove'; storeName: StoreName; key: string }

/**
 * A condition on one stored value for `guardedCommit`: the record at `key`
 * must have `field` equal to `equals`. A missing record has every field
 * `undefined`, so `{ equals: undefined }` means "no such record" (or no such
 * field).
 */
export interface Guard {
  storeName: StoreName
  key: string
  field: string
  equals: string | number | boolean | undefined
}

/**
 * The persistence interface both backends implement. Records go in and come
 * out as copies, matching IndexedDB's structured-clone semantics.
 */
export interface StorageAdapter {
  put<T extends StorageRecord>(storeName: StoreName, record: T): Promise<string>
  get<T extends StorageRecord>(
    storeName: StoreName,
    key: string,
  ): Promise<T | undefined>
  getAll<T extends StorageRecord>(storeName: StoreName): Promise<T[]>
  getAllByIndex<T extends StorageRecord>(
    storeName: StoreName,
    indexName: string,
    value: IDBValidKey | null | undefined,
  ): Promise<T[]>
  /**
   * Applies puts and deletes across several stores as one unit: either every
   * change applies or none does. Deletes only go through here, so each one
   * can queue its outbox entry in the same unit.
   */
  commit(changes: readonly Change[]): Promise<void>
  /**
   * Applies `changes` only if every guard still holds, checked in the same
   * transaction as the writes, so nothing can change in between. Resolves to
   * whether the changes were applied. Sync needs this to never overwrite an
   * edit made while it was talking to the server.
   */
  guardedCommit(
    guards: readonly Guard[],
    changes: readonly Change[],
  ): Promise<boolean>
  /**
   * Releases the store. The IndexedDB adapter can't be used after this; open
   * a new one instead.
   */
  close(): Promise<void>
}
