import type { StoreName } from './schema.ts'

/** Every stored record is keyed by a string `id`. */
export interface StorageRecord {
  id: string
}

/** One record to delete, named by store and key. */
export interface Removal {
  storeName: StoreName
  key: string
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
  remove(storeName: StoreName, key: string): Promise<void>
  removeByIndex(
    storeName: StoreName,
    indexName: string,
    value: IDBValidKey | null | undefined,
  ): Promise<void>
  /**
   * Deletes records from several stores as one unit: either every removal
   * applies or none does.
   */
  removeMany(removals: readonly Removal[]): Promise<void>
  close(): Promise<void>
}
