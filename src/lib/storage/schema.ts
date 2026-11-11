/**
 * Schema for the local-first store: IndexedDB is the primary store so US-07
 * offline reading works; Supabase is a later sync target.
 */

export const DB_NAME = 'somanami'

/** Bump whenever `STORES` changes so the upgrade path runs. */
export const DB_VERSION = 1

export const DOCUMENTS = 'documents'
export const CONVERSATIONS = 'conversations'
export const MESSAGES = 'messages'

export type StoreName =
  typeof DOCUMENTS | typeof CONVERSATIONS | typeof MESSAGES

export interface IndexDefinition {
  name: string
  keyPath: string
}

export interface StoreDefinition {
  name: StoreName
  keyPath: 'id'
  indexes: IndexDefinition[]
}

/**
 * Store definitions shared by every adapter, so the in-memory adapter and the
 * IndexedDB adapter cannot drift apart.
 */
export const STORES: readonly StoreDefinition[] = [
  { name: DOCUMENTS, keyPath: 'id', indexes: [] },
  {
    name: CONVERSATIONS,
    keyPath: 'id',
    indexes: [{ name: 'documentId', keyPath: 'documentId' }],
  },
  {
    name: MESSAGES,
    keyPath: 'id',
    indexes: [{ name: 'conversationId', keyPath: 'conversationId' }],
  },
]
