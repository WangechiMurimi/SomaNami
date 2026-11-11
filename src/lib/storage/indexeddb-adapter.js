import { requireIndexValue } from './index-value.js'
import { DB_NAME, DB_VERSION, STORES } from './schema.js'

/** Wraps an IDBRequest so the rest of the layer only ever deals in promises. */
const promisify = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

function upgrade(db) {
  for (const { name, keyPath, indexes } of STORES) {
    const store = db.objectStoreNames.contains(name)
      ? // `transaction` is only reachable during an upgrade, which is the only
        // time this function runs.
        db.transaction.objectStore(name)
      : db.createObjectStore(name, { keyPath })
    for (const index of indexes) {
      if (!store.indexNames.contains(index.name))
        store.createIndex(index.name, index.keyPath)
    }
  }
}

function openDatabase(factory) {
  const request = factory.open(DB_NAME, DB_VERSION)
  request.onupgradeneeded = () => upgrade(request.result)
  return promisify(request)
}

/**
 * Creates the IndexedDB-backed adapter; `factory` is injectable so a fake
 * backing store can stand in for the browser's `indexedDB`.
 */
export function createIndexedDbAdapter(factory = globalThis.indexedDB) {
  if (!factory)
    throw new Error('IndexedDB is not available in this environment')

  let connection

  const db = async () => (connection ??= await openDatabase(factory))

  const read = async (storeName, work) => {
    const database = await db()
    return work(
      database.transaction(storeName, 'readonly').objectStore(storeName),
    )
  }

  const write = async (storeName, work) => {
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

  const keysByIndex = (storeName, indexName, value) =>
    read(storeName, (store) => {
      requireIndexValue(indexName, value)
      return promisify(store.index(indexName).getAllKeys(value))
    })

  return {
    async put(storeName, record) {
      await write(storeName, (store) => store.put(record))
      return record.id
    },

    async get(storeName, key) {
      return read(storeName, (store) => promisify(store.get(key)))
    },

    async getAll(storeName) {
      return read(storeName, (store) => promisify(store.getAll()))
    },

    async getAllByIndex(storeName, indexName, value) {
      return read(storeName, (store) => {
        requireIndexValue(indexName, value)
        return promisify(store.index(indexName).getAll(value))
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

    async close() {
      ;(await db()).close()
      connection = undefined
    },
  }
}
