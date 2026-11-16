/**
 * Schema for the local-first store: IndexedDB is the primary store so US-07
 * offline reading works; Supabase is a later sync target.
 */

/**
 * The shared database from before accounts existed. New materials never go
 * here; it is only read to offer moving its contents into an account.
 */
export const DB_NAME = 'somanami'

/**
 * Each account's private database. A database per user keeps records free of
 * an owner field, and removing someone's materials is one `deleteDatabase`.
 */
export const userDbName = (userId: string): string => `somanami-user-${userId}`

/** Bump whenever `STORES` changes so the upgrade path runs. */
export const DB_VERSION = 3

export const WORKSPACES = 'workspaces' as const
export const DOCUMENTS = 'documents' as const
export const CONVERSATIONS = 'conversations' as const
export const MESSAGES = 'messages' as const
/** Local changes waiting to be pushed to the cloud (see `outbox.ts`). */
export const OUTBOX = 'outbox' as const
/** Sync bookkeeping, such as pull cursors, as `{ id, value }` records. */
export const SYNC_META = 'sync_meta' as const

/** The stores whose records sync, each named like its cloud table. */
export type SyncedStoreName =
  typeof WORKSPACES | typeof DOCUMENTS | typeof CONVERSATIONS | typeof MESSAGES

export type StoreName = SyncedStoreName | typeof OUTBOX | typeof SYNC_META

/** Synced stores, parent first: the order a pusher sends upserts in. */
export const SYNCED_STORES: readonly SyncedStoreName[] = [
  WORKSPACES,
  DOCUMENTS,
  CONVERSATIONS,
  MESSAGES,
]

/**
 * The workspace that materials and chats saved before workspaces existed are
 * moved into, and that uploads use until the user picks a workspace.
 */
export const DEFAULT_WORKSPACE = {
  id: 'default',
  name: 'My materials',
  topic: 'General',
  description: 'Everything you added before you made a workspace.',
} as const

export interface IndexDefinition {
  name: string
  keyPath: string
  /** Index each element of an array field, so a lookup matches any of them. */
  multiEntry?: boolean
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
  { name: WORKSPACES, keyPath: 'id', indexes: [] },
  {
    name: DOCUMENTS,
    keyPath: 'id',
    indexes: [{ name: 'workspaceId', keyPath: 'workspaceId' }],
  },
  {
    name: CONVERSATIONS,
    keyPath: 'id',
    indexes: [
      { name: 'workspaceId', keyPath: 'workspaceId' },
      { name: 'materialIds', keyPath: 'materialIds', multiEntry: true },
    ],
  },
  {
    name: MESSAGES,
    keyPath: 'id',
    indexes: [{ name: 'conversationId', keyPath: 'conversationId' }],
  },
  {
    name: OUTBOX,
    keyPath: 'id',
    indexes: [{ name: 'seq', keyPath: 'seq' }],
  },
  { name: SYNC_META, keyPath: 'id', indexes: [] },
]
