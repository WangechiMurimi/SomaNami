import type {
  Change,
  Removal,
  StorageAdapter,
  StorageRecord,
} from './adapter.ts'
import { requireIndexValue } from './index-value.ts'
import {
  CONVERSATIONS,
  DB_NAME,
  DB_VERSION,
  DEFAULT_WORKSPACE,
  DOCUMENTS,
  STORES,
  WORKSPACES,
} from './schema.ts'
import type { StoreName } from './schema.ts'

/** Wraps an IDBRequest so the rest of the layer only ever deals in promises. */
const promisify = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

/** Rewrites every record in a store, inside the version-change transaction. */
function rewriteAll(
  store: IDBObjectStore,
  change: (record: Record<string, unknown>) => Record<string, unknown>,
) {
  const request = store.openCursor()
  request.onsuccess = () => {
    const cursor = request.result
    if (!cursor) return
    cursor.update(change(cursor.value as Record<string, unknown>))
    cursor.continue()
  }
}

/**
 * v1 to v2 (US-08): files every existing material and chat under the default
 * workspace, and turns a chat's single `documentId` into `materialIds`.
 */
function moveIntoDefaultWorkspace(transaction: IDBTransaction) {
  const now = Date.now()
  transaction
    .objectStore(WORKSPACES)
    .put({ ...DEFAULT_WORKSPACE, createdAt: now, updatedAt: now })
  rewriteAll(transaction.objectStore(DOCUMENTS), (document) => ({
    ...document,
    workspaceId: DEFAULT_WORKSPACE.id,
  }))
  rewriteAll(
    transaction.objectStore(CONVERSATIONS),
    ({ documentId, ...conversation }) => ({
      ...conversation,
      workspaceId: DEFAULT_WORKSPACE.id,
      materialIds: typeof documentId === 'string' ? [documentId] : [],
    }),
  )
}

function upgrade(
  db: IDBDatabase,
  transaction: IDBTransaction,
  oldVersion: number,
) {
  for (const { name, keyPath, indexes } of STORES) {
    const store = db.objectStoreNames.contains(name)
      ? // The version-change transaction is only reachable during an upgrade,
        // which is the only time this function runs.
        transaction.objectStore(name)
      : db.createObjectStore(name, { keyPath })
    // Drop indexes the schema no longer lists (v1's conversations.documentId).
    const wanted = new Set(indexes.map((index) => index.name))
    for (const existing of [...store.indexNames]) {
      if (!wanted.has(existing)) store.deleteIndex(existing)
    }
    for (const index of indexes) {
      if (!store.indexNames.contains(index.name))
        store.createIndex(index.name, index.keyPath, {
          multiEntry: index.multiEntry ?? false,
        })
    }
  }
  // A brand-new database has nothing to move.
  if (oldVersion === 1) moveIntoDefaultWorkspace(transaction)
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  const request = factory.open(name, DB_VERSION)
  request.onupgradeneeded = (event) => {
    // Always set during `upgradeneeded`; the DOM typing just can't express it.
    if (request.transaction)
      upgrade(request.result, request.transaction, event.oldVersion)
  }
  return promisify(request)
}

/**
 * Deletes a whole database. Resolves once the deletion is queued even if
 * another tab still holds it open: the browser finishes it when that tab lets
 * go, and waiting here would hang the caller indefinitely.
 */
export function deleteDatabase(
  factory: IDBFactory,
  name: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onblocked = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export interface IndexedDbAdapterOptions {
  /** Database to open; defaults to the shared legacy database. */
  name?: string
}

/**
 * Creates the IndexedDB-backed adapter; `factory` is injectable so a fake
 * backing store can stand in for the browser's `indexedDB`.
 */
export function createIndexedDbAdapter(
  factory: IDBFactory | undefined = globalThis.indexedDB,
  { name = DB_NAME }: IndexedDbAdapterOptions = {},
): StorageAdapter {
  if (!factory)
    throw new Error('IndexedDB is not available in this environment')

  // Holding the pending open, not the connection, means calls made while the
  // database is still opening share one connection instead of racing to open
  // several, which would leave one unclosed and block a later delete.
  let connection: Promise<IDBDatabase> | undefined
  let deletedElsewhere = false

  const db = (): Promise<IDBDatabase> => {
    // Reopening would recreate the database empty and keep saving into it
    // after its owner removed their materials from this device.
    if (deletedElsewhere)
      return Promise.reject(
        new Error(`The "${name}" database was removed from this device`),
      )
    return (connection ??= openDatabase(factory, name).then(
      (database) => {
        // Another tab (or `deleteDatabase`) needs this database: let it go so
        // that tab isn't blocked. A schema upgrade reopens on the next call;
        // a deletion (`newVersion` null) does not.
        database.onversionchange = (event) => {
          database.close()
          connection = undefined
          if (event.newVersion === null) deletedElsewhere = true
        }
        return database
      },
      (error: unknown) => {
        connection = undefined
        throw error
      },
    ))
  }

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

    async commit(changes: readonly Change[]) {
      if (changes.length === 0) return
      const database = await db()
      const storeNames = [...new Set(changes.map((c) => c.storeName))]
      // One transaction over every store, as in removeMany.
      const transaction = database.transaction(storeNames, 'readwrite')
      const done = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
      for (const change of changes) {
        const store = transaction.objectStore(change.storeName)
        if (change.type === 'put') store.put(change.record)
        else store.delete(change.key)
      }
      await done
    },

    async close() {
      const pending = connection
      connection = undefined
      // Nothing to close if it never opened, and a failed open left nothing open.
      const database = await pending?.catch(() => undefined)
      database?.close()
    },
  }
}
