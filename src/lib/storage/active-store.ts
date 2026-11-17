/*
 * Which user's store storage calls read and write. Separate from the record
 * functions in index.ts so sync.ts can reach the same store; importers use
 * the public parts through index.ts.
 */
import type { StorageAdapter } from './adapter.ts'
import { assert } from './assert.ts'
import { createIndexedDbAdapter, deleteDatabase } from './indexeddb-adapter.ts'
import { createMemoryAdapter } from './memory-adapter.ts'
import { DOCUMENTS, userDbName } from './schema.ts'

let injected: StorageAdapter | undefined

interface UserStore {
  userId: string
  adapter: StorageAdapter
  /** Set once the database has actually opened. */
  open?: boolean
}

let current: UserStore | undefined

// Without IndexedDB nothing survives a reload anyway, but each user still gets
// their own store, kept for the session so switching back finds it again.
const memoryStores = new Map<string, StorageAdapter>()

/**
 * Swaps the backing store; tests inject a fake one, the app leaves it alone.
 * An injected adapter stands in for every user's store. Pass `null` to go
 * back to per-user stores.
 */
export function setStorageAdapter(next: StorageAdapter | null): void {
  injected = next ?? undefined
}

function adapterFor(userId: string): StorageAdapter {
  const factory = globalThis.indexedDB
  if (factory)
    return createIndexedDbAdapter(factory, { name: userDbName(userId) })
  let adapter = memoryStores.get(userId)
  if (!adapter) {
    adapter = createMemoryAdapter()
    memoryStores.set(userId, adapter)
  }
  return adapter
}

/** Opens the signed-in user's private store; later storage calls read and write it. */
export async function openUserStore(userId: string): Promise<void> {
  assert(userId, 'openUserStore needs a userId')
  if (injected) return
  if (current?.userId !== userId) {
    // Switch synchronously, so whichever open is called last wins even if an
    // earlier one is still waiting on its database.
    const previous = current
    current = { userId, adapter: adapterFor(userId) }
    void previous?.adapter.close()
  }
  const opening = current
  // Open now, so a database that won't open fails here, at the gate, rather
  // than on the first screen that reads it.
  try {
    await opening.adapter.get(DOCUMENTS, '')
  } catch (error) {
    // Don't leave a store that won't open selected: later calls should fail
    // with the clear "no user store" error, not retry a broken open.
    if (current === opening) current = undefined
    await opening.adapter.close()
    throw error
  }
  opening.open = true
  // Closed or switched while it was opening: don't keep a connection that
  // would block deleting this user's database.
  if (current !== opening) await opening.adapter.close()
}

/**
 * Whether storage calls for this user would succeed right now, without
 * waiting: their store is open, or a test injected an adapter.
 */
export function isUserStoreOpen(userId: string): boolean {
  return Boolean(injected) || (current?.userId === userId && !!current.open)
}

/** Closes the current user's store on sign-out or user switch. */
export function closeUserStore(): void {
  const closing = current
  current = undefined
  void closing?.adapter.close()
}

/**
 * Deletes one user's materials from this device, for shared computers.
 * `onBlocked` fires if another tab must close before the delete can finish.
 */
export async function removeUserStore(
  userId: string,
  { onBlocked }: { onBlocked?: () => void } = {},
): Promise<void> {
  if (current?.userId === userId) {
    const closing = current
    current = undefined
    // The delete waits on every open connection, ours included.
    await closing.adapter.close()
  }
  memoryStores.delete(userId)
  const factory = globalThis.indexedDB
  if (factory) await deleteDatabase(factory, userDbName(userId), { onBlocked })
}

// Functions that touch storage more than once take the store once up front, so
// a user switch mid-function can't split one operation across two users.
export const store = (): StorageAdapter => {
  if (injected) return injected
  // Falling back to a shared store here would mix one user's materials into
  // another's, so a call made before sign-in fails loudly instead.
  if (!current)
    throw new Error(
      'No user store is open: storage is only available inside <UserStoreGate>',
    )
  return current.adapter
}
