import type { Change, Guard, StorageAdapter, StorageRecord } from './adapter.ts'
import { requireIndexValue } from './index-value.ts'
import { STORES } from './schema.ts'
import type { StoreName } from './schema.ts'

// IndexedDB stores structured clones, so callers cannot mutate persisted data
// by holding on to the object they passed in. The in-memory adapter copies too,
// otherwise tests would pass against aliasing bugs that break in a real browser.
const copy = <T>(value: T): T =>
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))

/**
 * Creates an in-memory adapter with the same interface as the IndexedDB one;
 * used by tests (and as a fallback where IndexedDB is unavailable).
 */
export function createMemoryAdapter(): StorageAdapter {
  const stores = new Map<StoreName, Map<string, StorageRecord>>(
    STORES.map((store) => [store.name, new Map()]),
  )

  const indexFor = (storeName: StoreName, indexName: string) =>
    STORES.find((store) => store.name === storeName)?.indexes.find(
      (index) => index.name === indexName,
    )

  const entries = (storeName: StoreName) => {
    const store = stores.get(storeName)
    if (!store) throw new Error(`Unknown store "${storeName}"`)
    return store
  }

  // IndexedDB yields records in primary-key order, so the double must too —
  // otherwise insertion order makes a test pass here and fail in the browser.
  const byKey = (a: StorageRecord, b: StorageRecord) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0

  const sorted = (storeName: StoreName) =>
    [...entries(storeName).values()].sort(byKey)

  const matching = (
    storeName: StoreName,
    indexName: string,
    value: IDBValidKey | null | undefined,
  ) => {
    const index = indexFor(storeName, indexName)
    if (!index)
      throw new Error(`Unknown index "${indexName}" on store "${storeName}"`)
    requireIndexValue(indexName, value)
    return sorted(storeName).filter((record) => {
      const field = (record as unknown as Record<string, unknown>)[
        index.keyPath
      ]
      return index.multiEntry && Array.isArray(field)
        ? field.includes(value)
        : field === value
    })
  }

  const guardedCommit = async (
    guards: readonly Guard[],
    changes: readonly Change[],
  ): Promise<boolean> => {
    // Synchronous from check to write, so nothing can interleave: the same
    // guarantee the IndexedDB transaction gives.
    const holds = guards.every(({ storeName, key, field, equals }) => {
      const record = entries(storeName).get(key) as
        Record<string, unknown> | undefined
      return record?.[field] === equals
    })
    if (!holds) return false
    // Resolve every store before writing anything, so an unknown store
    // rejects the whole batch the way an IndexedDB transaction would.
    const targets = changes.map((change) => ({
      change,
      store: entries(change.storeName),
    }))
    for (const { change, store } of targets) {
      if (change.type === 'put')
        store.set(change.record.id, copy(change.record))
      else store.delete(change.key)
    }
    return true
  }

  return {
    async put(storeName, record) {
      entries(storeName).set(record.id, copy(record))
      return record.id
    },

    async get<T extends StorageRecord>(storeName: StoreName, key: string) {
      const record = entries(storeName).get(key) as T | undefined
      return record === undefined ? undefined : copy(record)
    },

    async getAll<T extends StorageRecord>(storeName: StoreName) {
      return sorted(storeName).map((record) => copy(record) as T)
    },

    async getAllByIndex<T extends StorageRecord>(
      storeName: StoreName,
      indexName: string,
      value: IDBValidKey | null | undefined,
    ) {
      return matching(storeName, indexName, value).map(
        (record) => copy(record) as T,
      )
    },

    async commit(changes: readonly Change[]) {
      await guardedCommit([], changes)
    },

    guardedCommit,

    async close() {
      // Nothing to release; present so callers can treat adapters alike.
    },
  }
}
