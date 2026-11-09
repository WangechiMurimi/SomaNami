import type { StoreName } from './schema.ts'

/** Every stored record is keyed by a string `id`. */
export interface StorageRecord {
  id: string
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
  close(): Promise<void>
}
