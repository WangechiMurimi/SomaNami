import { requireIndexValue } from './index-value.js'
import { STORES } from './schema.js'

// IndexedDB stores structured clones, so callers cannot mutate persisted data
// by holding on to the object they passed in. The in-memory adapter copies too,
// otherwise tests would pass against aliasing bugs that break in a real browser.
const copy = (value) =>
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))

/**
 * Creates an in-memory adapter with the same interface as the IndexedDB one;
 * used by tests (and as a fallback where IndexedDB is unavailable).
 */
export function createMemoryAdapter() {
  const stores = new Map(STORES.map((store) => [store.name, new Map()]))

  const indexKeyPath = (storeName, indexName) =>
    STORES.find((store) => store.name === storeName)?.indexes.find(
      (index) => index.name === indexName,
    )?.keyPath

  const entries = (storeName) => {
    const store = stores.get(storeName)
    if (!store) throw new Error(`Unknown store "${storeName}"`)
    return store
  }

  // IndexedDB yields records in primary-key order, so the double must too —
  // otherwise insertion order makes a test pass here and fail in the browser.
  const byKey = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

  const sorted = (storeName) => [...entries(storeName).values()].sort(byKey)

  const matching = (storeName, indexName, value) => {
    const keyPath = indexKeyPath(storeName, indexName)
    if (!keyPath)
      throw new Error(`Unknown index "${indexName}" on store "${storeName}"`)
    requireIndexValue(indexName, value)
    return sorted(storeName).filter((record) => record[keyPath] === value)
  }

  return {
    async put(storeName, record) {
      entries(storeName).set(record.id, copy(record))
      return record.id
    },

    async get(storeName, key) {
      const record = entries(storeName).get(key)
      return record === undefined ? undefined : copy(record)
    },

    async getAll(storeName) {
      return sorted(storeName).map(copy)
    },

    async getAllByIndex(storeName, indexName, value) {
      return matching(storeName, indexName, value).map(copy)
    },

    async remove(storeName, key) {
      entries(storeName).delete(key)
    },

    async removeByIndex(storeName, indexName, value) {
      const store = entries(storeName)
      for (const record of matching(storeName, indexName, value))
        store.delete(record.id)
    },

    async close() {
      // Nothing to release; present so callers can treat adapters alike.
    },
  }
}
