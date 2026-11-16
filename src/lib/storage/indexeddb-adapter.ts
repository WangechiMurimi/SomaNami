import type {
  Change,
  Guard,
  Removal,
  StorageAdapter,
  StorageRecord,
} from './adapter.ts'
import { requireIndexValue } from './index-value.ts'
import { changedAt, outboxEntry } from './outbox.ts'
import {
  CONVERSATIONS,
  DB_NAME,
  DB_VERSION,
  DEFAULT_WORKSPACE,
  DOCUMENTS,
  OUTBOX,
  STORES,
  SYNCED_STORES,
  WORKSPACES,
} from './schema.ts'
import type { StoreName, SyncedStoreName } from './schema.ts'

/** Wraps an IDBRequest so the rest of the layer only ever deals in promises. */
const promisify = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

type RawRecord = Record<string, unknown>
type Step = (record: RawRecord) => RawRecord

/**
 * Visits every record in a store inside the version-change transaction,
 * applying `steps` in order and writing the result back.
 */
function forEachRecord(
  store: IDBObjectStore,
  steps: readonly Step[],
  visit: (record: RawRecord) => void,
) {
  const request = store.openCursor()
  request.onsuccess = () => {
    const cursor = request.result
    if (!cursor) return
    const record = steps.reduce(
      (current, step) => step(current),
      cursor.value as RawRecord,
    )
    if (steps.length > 0) cursor.update(record)
    visit(record)
    cursor.continue()
  }
}

/**
 * Brings existing records up to the current schema. Each version adds steps
 * per store, and every store is walked once: two cursors over one store in
 * the same transaction would each write back a stale copy of the other's work.
 */
function migrateRecords(transaction: IDBTransaction, oldVersion: number) {
  const now = Date.now()
  const steps = new Map<SyncedStoreName, Step[]>()
  const addStep = (name: SyncedStoreName, step: Step) =>
    steps.set(name, [...(steps.get(name) ?? []), step])

  if (oldVersion < 2) {
    // v1 to v2 (US-08): files every existing material and chat under the
    // default workspace, and turns a chat's single `documentId` into
    // `materialIds`.
    transaction
      .objectStore(WORKSPACES)
      .put({ ...DEFAULT_WORKSPACE, createdAt: now, updatedAt: now })
    addStep(DOCUMENTS, (document) => ({
      ...document,
      workspaceId: DEFAULT_WORKSPACE.id,
    }))
    addStep(CONVERSATIONS, ({ documentId, ...conversation }) => ({
      ...conversation,
      workspaceId: DEFAULT_WORKSPACE.id,
      materialIds: typeof documentId === 'string' ? [documentId] : [],
    }))
  }

  // v2 to v3 (#146): documents gain the timestamps sync compares (their real
  // dates were never recorded, so the upgrade time stands in), and every
  // record gets an outbox entry so it is pushed on the first sync.
  const seedOutbox = oldVersion < 3
  if (seedOutbox)
    addStep(DOCUMENTS, (document) => ({
      createdAt: now,
      updatedAt: now,
      ...document,
    }))
  const outbox = seedOutbox ? transaction.objectStore(OUTBOX) : undefined

  for (const name of SYNCED_STORES) {
    const storeSteps = steps.get(name) ?? []
    if (storeSteps.length === 0 && !outbox) continue
    forEachRecord(transaction.objectStore(name), storeSteps, (record) =>
      outbox?.put(
        outboxEntry(name, String(record.id), 'upsert', changedAt(record)),
      ),
    )
  }
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
  if (oldVersion > 0) migrateRecords(transaction, oldVersion)
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
 * Deletes a whole database, resolving once it's gone. Pass `evenIfBlocked`
 * to resolve as soon as the delete is queued instead, for callers that must
 * not wait on a tab that may never let go; `onBlocked` hears that it waits.
 */
export function deleteDatabase(
  factory: IDBFactory,
  name: string,
  {
    evenIfBlocked = false,
    onBlocked,
  }: { evenIfBlocked?: boolean; onBlocked?: () => void } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name)
    request.onsuccess = () => resolve()
    // `blocked` means another tab still holds a connection: the delete stays
    // queued and succeeds once that tab lets go. By default wait for it, so
    // materials are never reported removed while still on the device.
    request.onblocked = () => {
      onBlocked?.()
      if (evenIfBlocked) resolve()
    }
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
  // Closing is for good: a call that still holds this adapter afterwards
  // (one started before a user switch or a removal) would otherwise reopen,
  // and so recreate, a database its owner may have just removed.
  let closed = false

  const db = (): Promise<IDBDatabase> => {
    if (closed)
      return Promise.reject(new Error(`The "${name}" database was closed`))
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

    async guardedCommit(guards: readonly Guard[], changes: readonly Change[]) {
      if (guards.length === 0 && changes.length === 0) return true
      const database = await db()
      const storeNames = [
        ...new Set([
          ...guards.map((g) => g.storeName),
          ...changes.map((c) => c.storeName),
        ]),
      ]
      const transaction = database.transaction(storeNames, 'readwrite')
      let applied = false
      const done = new Promise<boolean>((resolve, reject) => {
        transaction.oncomplete = () => resolve(applied)
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
      // Requests issued from request callbacks keep the transaction open, so
      // the reads and the writes they decide on commit as one unit.
      let pending = guards.length
      let holds = true
      const write = () => {
        if (!holds) return
        for (const change of changes) {
          const store = transaction.objectStore(change.storeName)
          if (change.type === 'put') store.put(change.record)
          else store.delete(change.key)
        }
        applied = true
      }
      if (pending === 0) write()
      for (const { storeName, key, field, equals } of guards) {
        const request = transaction.objectStore(storeName).get(key)
        request.onsuccess = () => {
          const record = request.result as Record<string, unknown> | undefined
          if (record?.[field] !== equals) holds = false
          pending -= 1
          if (pending === 0) write()
        }
      }
      return done
    },

    async close() {
      closed = true
      const pending = connection
      connection = undefined
      // Nothing to close if it never opened, and a failed open left nothing open.
      const database = await pending?.catch(() => undefined)
      database?.close()
    },
  }
}
