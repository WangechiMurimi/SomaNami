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
export const DB_VERSION = 2

export const WORKSPACES = 'workspaces' as const
export const DOCUMENTS = 'documents' as const
export const CONVERSATIONS = 'conversations' as const
export const MESSAGES = 'messages' as const

export type StoreName =
  typeof WORKSPACES | typeof DOCUMENTS | typeof CONVERSATIONS | typeof MESSAGES

/**
 * Holds everything added outside a workspace: loose chats (shown under
 * Recents) and their materials, plus whatever predates workspaces. The UI
 * never lists it as a workspace.
 */
export const DEFAULT_WORKSPACE = {
  id: 'default',
  name: 'My materials',
  topic: 'General',
  description: 'Chats and materials added outside a workspace.',
} as const

/** True for the default workspace that holds loose chats. */
export const isLooseWorkspace = (workspaceId: string): boolean =>
  workspaceId === DEFAULT_WORKSPACE.id

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
]
