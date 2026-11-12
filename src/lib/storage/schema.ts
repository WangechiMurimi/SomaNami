/**
 * Schema for the local-first store: IndexedDB is the primary store so US-07
 * offline reading works; Supabase is a later sync target.
 */

export const DB_NAME = 'somanami'

/** Bump whenever `STORES` changes so the upgrade path runs. */
export const DB_VERSION = 2

export const WORKSPACES = 'workspaces' as const
export const DOCUMENTS = 'documents' as const
export const CONVERSATIONS = 'conversations' as const
export const MESSAGES = 'messages' as const

export type StoreName =
  typeof WORKSPACES | typeof DOCUMENTS | typeof CONVERSATIONS | typeof MESSAGES

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
]
