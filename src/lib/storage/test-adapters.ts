import { IDBFactory } from 'fake-indexeddb'
import type { StorageAdapter } from './adapter.ts'
import { createIndexedDbAdapter } from './indexeddb-adapter.ts'
import { createMemoryAdapter } from './memory-adapter.ts'

/**
 * Both adapters as `describe.each` rows, so every behavioural assertion runs
 * against the real IndexedDB path as well as the in-memory double.
 *
 * A fresh `IDBFactory` per adapter keeps each test isolated and leaves the
 * global `indexedDB` alone, so the rest of the suite is unaffected.
 */
export const ADAPTERS: Array<[string, () => StorageAdapter]> = [
  ['memory', () => createMemoryAdapter()],
  ['indexeddb', () => createIndexedDbAdapter(new IDBFactory())],
]
