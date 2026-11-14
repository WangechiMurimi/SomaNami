import type { StorageAdapter } from './adapter.ts'
import { createIndexedDbAdapter, deleteDatabase } from './indexeddb-adapter.ts'
import { DB_NAME, STORES } from './schema.ts'

/**
 * Before accounts, everything on a device lived in one shared database. These
 * helpers let the first account that claims those materials move them into
 * its own database, or set them aside for someone else to claim.
 */

const declinedKey = (userId: string) => `somanami-legacy-import:${userId}`

// Opening a database that doesn't exist creates it, which would make every
// later check think there were legacy materials to offer. Aborting the
// upgrade that a brand-new database triggers leaves nothing behind.
function openLegacyIfPresent(
  factory: IDBFactory,
): Promise<IDBDatabase | undefined> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME)
    let created = false
    request.onupgradeneeded = () => {
      created = true
      request.transaction?.abort()
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = (event) => {
      if (!created) return reject(request.error)
      // The abort is ours; keep it from surfacing as an unhandled error.
      event.preventDefault()
      resolve(undefined)
    }
  })
}

const count = (store: IDBObjectStore) =>
  new Promise<number>((resolve, reject) => {
    const request = store.count()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

/**
 * Whether this device holds documents, conversations or messages from before
 * accounts. Counts rather than reads, so a large legacy library doesn't slow
 * every sign-in while it waits to be claimed.
 */
export async function hasLegacyMaterials(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): Promise<boolean> {
  if (!factory) return false
  const database = await openLegacyIfPresent(factory)
  if (!database) return false
  try {
    const names = STORES.map((store) => store.name).filter((name) =>
      database.objectStoreNames.contains(name),
    )
    if (names.length === 0) return false
    const transaction = database.transaction(names, 'readonly')
    const counts = await Promise.all(
      names.map((name) => count(transaction.objectStore(name))),
    )
    return counts.some((n) => n > 0)
  } finally {
    database.close()
  }
}

/**
 * Copies every legacy record into `target`, checks each one arrived, and only
 * then deletes the legacy database. Any failure leaves the legacy database
 * untouched; copies already made are harmless because a retry overwrites them
 * by id.
 */
export async function moveLegacyMaterials({
  target,
  factory = globalThis.indexedDB,
}: {
  target: StorageAdapter
  factory?: IDBFactory
}): Promise<void> {
  if (!factory) return
  const legacy = createIndexedDbAdapter(factory, { name: DB_NAME })
  try {
    for (const { name } of STORES) {
      const records = await legacy.getAll(name)
      for (const record of records) await target.put(name, record)

      const arrived = new Set((await target.getAll(name)).map((r) => r.id))
      const missing = records.filter((record) => !arrived.has(record.id))
      if (missing.length > 0)
        throw new Error(
          `Moved ${name} did not all arrive (${missing.length} of ${records.length} missing)`,
        )
    }
  } finally {
    // The delete below waits on every open connection, this one included.
    await legacy.close()
  }
  // Every record is already copied and checked. A tab still running the
  // version from before accounts never lets go of this database, so don't
  // wait on it: the queued delete finishes once that tab closes.
  await deleteDatabase(factory, DB_NAME, { evenIfBlocked: true })
}

/** Whether this user chose to leave the legacy materials aside. */
export function legacyImportDeclined(userId: string): boolean {
  try {
    return localStorage.getItem(declinedKey(userId)) === 'declined'
  } catch {
    // Storage blocked: asking again next time is the safe outcome.
    return false
  }
}

/** Remembers that this user left the legacy materials aside, so they aren't asked again. */
export function declineLegacyImport(userId: string): void {
  try {
    localStorage.setItem(declinedKey(userId), 'declined')
  } catch {
    // Storage blocked: the choice holds for this session only.
  }
}
