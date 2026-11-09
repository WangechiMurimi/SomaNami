import type { Removal, StorageAdapter, StorageRecord } from './adapter.ts'
import { requireIndexValue } from './index-value.ts'
import { DB_NAME, DB_VERSION, STORES } from './schema.ts'
import type { StoreName } from './schema.ts'

/** Wraps an IDBRequest so the rest of the layer only ever deals in promises. */
const promisify = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

function upgrade(db: IDBDatabase, transaction: IDBTransaction) {
  for (const { name, keyPath, indexes } of STORES) {
    const store = db.objectStoreNames.contains(name)
      ? // The version-change transaction is only reachable during an upgrade,
        // which is the only time this function runs.
        transaction.objectStore(name)
      : db.createObjectStore(name, { keyPath })
    for (const index of indexes) {
      if (!store.indexNames.contains(index.name))
        store.createIndex(index.name, index.keyPath)
    }
  }
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  const request = factory.open(DB_NAME, DB_VERSION)
  request.onupgradeneeded = () => {
    // Always set during `upgradeneeded`; the DOM typing just can't express it.
    if (request.transaction) upgrade(request.result, request.transaction)
  }
  return promisify(request)
}

/**
 * Creates the IndexedDB-backed adapter; `factory` is injectable so a fake
 * backing store can stand in for the browser's `indexedDB`.
 */
export function createIndexedDbAdapter(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): StorageAdapter {
  if (!factory)
    throw new Error('IndexedDB is not available in this environment')

  let connection: IDBDatabase | undefined

  const db = async () => (connection ??= await openDatabase(factory))

  const read = async <T>(
    storeName: StoreName,
    work: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> => {
    const database = await db()
    return work(
      database.transaction(storeName, 'readonly').objectStore(storeName),
    )
  }

  const write = async (
    storeName: StoreName,
    work: (store: IDBObjectStore) => void,
  ): Promise<void> => {
    const database = await db()
    const transaction = database.transaction(storeName, 'readwrite')
    work(transaction.objectStore(storeName))
    // Wait on the transaction rather than the request: a write is not durable
    // until its transaction commits.
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  }

  const keysByIndex = (
    storeName: StoreName,
    indexName: string,
    value: IDBValidKey | null | undefined,
  ) =>
    read(storeName, (store) => {
      const key = requireIndexValue(indexName, value)
      return promisify(store.index(indexName).getAllKeys(key))
    })

  return {
    async put(storeName, record) {
      await write(storeName, (store) => store.put(record))
      return record.id
    },

    async get<T extends StorageRecord>(storeName: StoreName, key: string) {
      return read(
        storeName,
        (store) => promisify(store.get(key)) as Promise<T | undefined>,
      )
    },

    async getAll<T extends StorageRecord>(storeName: StoreName) {
      return read(
        storeName,
        (store) => promisify(store.getAll()) as Promise<T[]>,
      )
    },

    async getAllByIndex<T extends StorageRecord>(
      storeName: StoreName,
      indexName: string,
      value: IDBValidKey | null | undefined,
    ) {
      return read(storeName, (store) => {
        const key = requireIndexValue(indexName, value)
        return promisify(store.index(indexName).getAll(key)) as Promise<T[]>
      })
    },

    async remove(storeName, key) {
      await write(storeName, (store) => store.delete(key))
    },

    async removeByIndex(storeName, indexName, value) {
      const keys = await keysByIndex(storeName, indexName, value)
      await write(storeName, (store) => {
        for (const key of keys) store.delete(key)
      })
    },

    async removeMany(removals: readonly Removal[]) {
      if (removals.length === 0) return
      const database = await db()
      const storeNames = [...new Set(removals.map((r) => r.storeName))]
      // One transaction over every store involved: IndexedDB commits all of its
      // requests together or aborts them all, which is the atomicity we need.
      // An unknown store name throws here, before anything is deleted.
      const transaction = database.transaction(storeNames, 'readwrite')
      const done = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
      for (const { storeName, key } of removals) {
        transaction.objectStore(storeName).delete(key)
      }
      await done
    },

    async close() {
      ;(await db()).close()
      connection = undefined
    },
  }
}
