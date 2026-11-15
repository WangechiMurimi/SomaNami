import type {
  AssistantMessage,
  ChunkRef,
  Conversation,
  Message,
  NewDocument,
  Role,
  StoredDocument,
  UserMessage,
  Workspace,
} from '../../types/contracts.ts'
import type { Change, StorageAdapter } from './adapter.ts'
import { createIndexedDbAdapter, deleteDatabase } from './indexeddb-adapter.ts'
import { moveLegacyMaterials } from './import-legacy.ts'
import { createMemoryAdapter } from './memory-adapter.ts'
import { changedAt, tombstone, upsert } from './outbox.ts'
import type { OutboxEntry } from './outbox.ts'
import {
  CONVERSATIONS,
  DEFAULT_WORKSPACE,
  DOCUMENTS,
  MESSAGES,
  OUTBOX,
  SYNC_META,
  WORKSPACES,
  userDbName,
} from './schema.ts'
import type { SyncedStoreName } from './schema.ts'

export type { Change, StorageAdapter, StorageRecord } from './adapter.ts'
export type { OutboxEntry, OutboxOperation } from './outbox.ts'
export { createIndexedDbAdapter } from './indexeddb-adapter.ts'
export { createMemoryAdapter } from './memory-adapter.ts'
export {
  declineLegacyImport,
  hasLegacyMaterials,
  legacyImportDeclined,
} from './import-legacy.ts'
export {
  CONVERSATIONS,
  DB_NAME,
  DB_VERSION,
  DEFAULT_WORKSPACE,
  DOCUMENTS,
  MESSAGES,
  OUTBOX,
  STORES,
  SYNC_META,
  SYNCED_STORES,
  WORKSPACES,
  userDbName,
} from './schema.ts'
export type { StoreName, SyncedStoreName } from './schema.ts'

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
const store = (): StorageAdapter => {
  if (injected) return injected
  // Falling back to a shared store here would mix one user's materials into
  // another's, so a call made before sign-in fails loudly instead.
  if (!current)
    throw new Error(
      'No user store is open: storage is only available inside <UserStoreGate>',
    )
  return current.adapter
}

/** Moves the materials from before accounts into the open user's store. */
export async function importLegacyMaterials(): Promise<void> {
  await moveLegacyMaterials({ target: store() })
  notifyDocuments()
  notifyWorkspaces()
  notifyConversations()
}

const newId = (): string => crypto.randomUUID()

/** A set of listeners notified after a kind of record changes. */
function createSignal() {
  const listeners = new Set<() => void>()
  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    notify(): void {
      for (const listener of listeners) listener()
    },
  }
}

const conversationSignal = createSignal()
const workspaceSignal = createSignal()
const documentSignal = createSignal()
const notifyConversations = conversationSignal.notify
const notifyWorkspaces = workspaceSignal.notify
const notifyDocuments = documentSignal.notify

/**
 * Calls `listener` after any conversation is created, changed or removed, so
 * lists such as the sidebar's recent chats stay current without polling.
 * Returns the unsubscribe function.
 */
export const subscribeToConversations = conversationSignal.subscribe

/** As `subscribeToConversations`, for workspaces. */
export const subscribeToWorkspaces = workspaceSignal.subscribe

/**
 * As `subscribeToConversations`, for materials, so the Library refreshes when
 * one is saved or removed elsewhere (another screen, or a sync pull).
 */
export const subscribeToDocuments = documentSignal.subscribe

// Types guard compile-time callers; these guard data that arrives untyped at
// runtime, where a missing id would otherwise corrupt an index lookup.
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new TypeError(message)
}

const byRecentActivity = (
  a: { updatedAt: number },
  b: { updatedAt: number },
): number => b.updatedAt - a.updatedAt

// ── Workspaces ─────────────────────────────────────────────────────────────

export interface NewWorkspace {
  name: string
  topic?: string
  description?: string
}

/** Creates a workspace (US-08 AC1) and returns the stored record. */
export async function createWorkspace({
  name,
  topic = '',
  description = '',
}: NewWorkspace): Promise<Workspace> {
  assert(name?.trim(), 'createWorkspace needs a name')
  const now = Date.now()
  const workspace: Workspace = {
    id: newId(),
    name: name.trim(),
    topic: topic.trim(),
    description: description.trim(),
    createdAt: now,
    updatedAt: now,
  }
  await store().commit(upsert(WORKSPACES, workspace))
  notifyWorkspaces()
  return workspace
}

/** Reads one workspace, or `undefined` when it is not held locally. */
export async function getWorkspace(id: string): Promise<Workspace | undefined> {
  return store().get<Workspace>(WORKSPACES, id)
}

/** Lists every workspace, most recently updated first. */
export async function listWorkspaces(): Promise<Workspace[]> {
  const workspaces = await store().getAll<Workspace>(WORKSPACES)
  return workspaces.sort(byRecentActivity)
}

/** Changes a workspace's name, topic or description. */
export async function updateWorkspace(
  id: string,
  changes: Partial<NewWorkspace>,
): Promise<Workspace> {
  const workspace = await getWorkspace(id)
  if (!workspace) throw new Error(`No workspace "${id}"`)
  const name = changes.name?.trim() ?? workspace.name
  assert(name, 'A workspace needs a name')
  const updated: Workspace = {
    ...workspace,
    name,
    topic: changes.topic?.trim() ?? workspace.topic,
    description: changes.description?.trim() ?? workspace.description,
    updatedAt: Date.now(),
  }
  await store().commit(upsert(WORKSPACES, updated))
  notifyWorkspaces()
  return updated
}

/**
 * The workspace uploads go to before the user has made one. Created on first
 * use, so a fresh install and an upgraded one end up with the same record.
 */
export async function ensureDefaultWorkspace(): Promise<Workspace> {
  const existing = await getWorkspace(DEFAULT_WORKSPACE.id)
  if (existing) return existing
  const now = Date.now()
  const workspace: Workspace = {
    ...DEFAULT_WORKSPACE,
    createdAt: now,
    updatedAt: now,
  }
  await store().commit(upsert(WORKSPACES, workspace))
  notifyWorkspaces()
  return workspace
}

/**
 * Removes a workspace with every material, conversation and message in it,
 * in one batch so an interrupted delete cannot leave orphans behind.
 */
export async function deleteWorkspace(id: string): Promise<void> {
  assert(id, 'deleteWorkspace needs an id')
  const db = store()
  const [documents, conversations] = await Promise.all([
    db.getAllByIndex<StoredDocument>(DOCUMENTS, 'workspaceId', id),
    db.getAllByIndex<Conversation>(CONVERSATIONS, 'workspaceId', id),
  ])
  const messages = await messagesOf(db, conversations)
  const now = Date.now()
  await db.commit([
    ...messages.flatMap(removed(MESSAGES, now)),
    ...conversations.flatMap(removed(CONVERSATIONS, now)),
    ...documents.flatMap(removed(DOCUMENTS, now)),
    ...tombstone(WORKSPACES, id, now),
  ])
  notifyWorkspaces()
  if (documents.length > 0) notifyDocuments()
  if (conversations.length > 0) notifyConversations()
}

// Every cascaded removal gets its own tombstone, so another device deletes
// each record rather than relying on the cloud's cascade reaching it.
const removed =
  (storeName: SyncedStoreName, deletedAt: number) =>
  ({ id }: { id: string }): Change[] =>
    tombstone(storeName, id, deletedAt)

// Takes the store from the caller, so a multi-step write stays in one user's
// database even if the account switches while it runs.
const messagesOf = async (
  db: StorageAdapter,
  conversations: readonly Conversation[],
) =>
  (
    await Promise.all(
      conversations.map(({ id }) =>
        db.getAllByIndex<Message>(MESSAGES, 'conversationId', id),
      ),
    )
  ).flat()

// ── Materials ──────────────────────────────────────────────────────────────

/**
 * Files a parsed material into a workspace and persists it, chunks and their
 * `source` references included. Each material belongs to exactly one
 * workspace (US-08 AC2); without one it goes to the default workspace.
 */
export async function saveDocument(
  document: NewDocument | StoredDocument,
  workspaceId: string = 'workspaceId' in document
    ? document.workspaceId
    : DEFAULT_WORKSPACE.id,
): Promise<StoredDocument> {
  assert(document?.id, 'saveDocument needs a document with an id')
  const workspace =
    workspaceId === DEFAULT_WORKSPACE.id
      ? await ensureDefaultWorkspace()
      : await getWorkspace(workspaceId)
  if (!workspace) throw new Error(`No workspace "${workspaceId}"`)
  const now = Date.now()
  const stored: StoredDocument = {
    ...document,
    workspaceId,
    createdAt: 'createdAt' in document ? document.createdAt : now,
    updatedAt: now,
  }
  await store().commit(upsert(DOCUMENTS, stored))
  notifyDocuments()
  return stored
}

/** Reads one stored document, or `undefined` when it is not held locally. */
export async function getDocument(
  id: string,
): Promise<StoredDocument | undefined> {
  return store().get<StoredDocument>(DOCUMENTS, id)
}

const byName = (a: StoredDocument, b: StoredDocument) =>
  a.name.localeCompare(b.name)

/** Lists every stored document, ordered by name so the library reads predictably. */
export async function listDocuments(): Promise<StoredDocument[]> {
  const documents = await store().getAll<StoredDocument>(DOCUMENTS)
  return documents.sort(byName)
}

/** Lists the materials in one workspace, ordered by name. */
export async function listWorkspaceDocuments(
  workspaceId: string,
): Promise<StoredDocument[]> {
  assert(workspaceId, 'listWorkspaceDocuments needs a workspaceId')
  const documents = await store().getAllByIndex<StoredDocument>(
    DOCUMENTS,
    'workspaceId',
    workspaceId,
  )
  return documents.sort(byName)
}

/**
 * Removes a material. Conversations that used it keep their other materials;
 * a conversation left with none is removed with its messages, since nothing
 * could answer it any more. Everything happens in one batch.
 */
export async function deleteDocument(id: string): Promise<void> {
  const db = store()
  const conversations = await db.getAllByIndex<Conversation>(
    CONVERSATIONS,
    'materialIds',
    id,
  )
  const emptied = conversations.filter(({ materialIds }) =>
    materialIds.every((materialId) => materialId === id),
  )
  const kept = conversations.filter((c) => !emptied.includes(c))
  const messages = await messagesOf(db, emptied)
  const now = Date.now()
  await db.commit([
    ...messages.flatMap(removed(MESSAGES, now)),
    ...emptied.flatMap(removed(CONVERSATIONS, now)),
    // A kept conversation changed (it lost a material), so it gets a newer
    // `updatedAt`; otherwise last-write-wins could restore the old list.
    ...kept.flatMap((conversation) => {
      const record: Conversation = {
        ...conversation,
        materialIds: conversation.materialIds.filter((m) => m !== id),
        updatedAt: now,
      }
      return upsert(CONVERSATIONS, record)
    }),
    ...tombstone(DOCUMENTS, id, now),
  ])
  notifyDocuments()
  if (conversations.length > 0) notifyConversations()
}

// ── Conversations ──────────────────────────────────────────────────────────

export interface NewConversation {
  workspaceId?: string
  materialIds?: readonly string[]
  title?: string
}

/**
 * Starts a conversation over chosen materials of one workspace. Every
 * material must belong to that workspace, so a chat can never draw on
 * another workspace's materials (US-08 AC3).
 */
export async function createConversation({
  workspaceId,
  materialIds = [],
  title = 'Untitled conversation',
}: NewConversation = {}): Promise<Conversation> {
  assert(workspaceId, 'createConversation needs a workspaceId')
  assert(materialIds.length > 0, 'createConversation needs materialIds')
  const materials = await Promise.all(materialIds.map(getDocument))
  materials.forEach((material, index) => {
    if (material?.workspaceId !== workspaceId) {
      throw new Error(
        `Material "${materialIds[index]}" is not in workspace "${workspaceId}"`,
      )
    }
  })
  const now = Date.now()
  const conversation: Conversation = {
    id: newId(),
    workspaceId,
    materialIds: [...new Set(materialIds)],
    title,
    createdAt: now,
    updatedAt: now,
  }
  await store().commit(upsert(CONVERSATIONS, conversation))
  notifyConversations()
  return conversation
}

/** Reads one conversation, or `undefined` when it is not held locally. */
export async function getConversation(
  id: string,
): Promise<Conversation | undefined> {
  return store().get<Conversation>(CONVERSATIONS, id)
}

/** Lists the conversations that use a material, most recently updated first. */
export async function listConversations(
  materialId: string,
): Promise<Conversation[]> {
  assert(materialId, 'listConversations needs a materialId')
  const conversations = await store().getAllByIndex<Conversation>(
    CONVERSATIONS,
    'materialIds',
    materialId,
  )
  return conversations.sort(byRecentActivity)
}

/** Lists a workspace's conversations, most recently updated first. */
export async function listWorkspaceConversations(
  workspaceId: string,
): Promise<Conversation[]> {
  assert(workspaceId, 'listWorkspaceConversations needs a workspaceId')
  const conversations = await store().getAllByIndex<Conversation>(
    CONVERSATIONS,
    'workspaceId',
    workspaceId,
  )
  return conversations.sort(byRecentActivity)
}

/** Lists conversations across every workspace, most recently updated first. */
export async function listRecentConversations(
  limit = Infinity,
): Promise<Conversation[]> {
  const conversations = await store().getAll<Conversation>(CONVERSATIONS)
  return conversations.sort(byRecentActivity).slice(0, limit)
}

/** Renames a conversation and returns the updated record. */
export async function renameConversation(
  id: string,
  title: string,
): Promise<Conversation> {
  const db = store()
  const conversation = await db.get<Conversation>(CONVERSATIONS, id)
  if (!conversation) throw new Error(`No conversation "${id}"`)
  const updated = { ...conversation, title, updatedAt: Date.now() }
  await db.commit(upsert(CONVERSATIONS, updated))
  notifyConversations()
  return updated
}

export interface NewMessage {
  conversationId?: string
  role?: Role
  content?: string
  citations?: ChunkRef[]
  answerable?: boolean
  createdAt?: number
}

/**
 * Appends a message to a conversation and touches the conversation so the
 * list stays ordered by recent activity.
 */
export async function appendMessage({
  conversationId,
  role,
  content = '',
  citations,
  answerable,
  createdAt,
}: NewMessage = {}): Promise<Message> {
  const db = store()
  assert(conversationId, 'appendMessage needs a conversationId')
  assert(
    role === 'user' || role === 'assistant',
    'appendMessage needs role "user" or "assistant"',
  )

  const conversation = await db.get<Conversation>(CONVERSATIONS, conversationId)
  if (!conversation) throw new Error(`No conversation "${conversationId}"`)

  const base = {
    id: newId(),
    conversationId,
    content,
    createdAt: createdAt ?? Date.now(),
  }
  // Grounding fields are assistant-only; leaving them off user messages keeps
  // the stored shape honest about what was actually cited.
  const message: Message =
    role === 'assistant'
      ? ({
          ...base,
          role,
          citations: citations ?? [],
          answerable: answerable ?? false,
        } satisfies AssistantMessage)
      : ({ ...base, role } satisfies UserMessage)

  // One commit, so a message is never stored without its conversation being
  // touched (or queued for upload without it).
  await db.commit([
    ...upsert(MESSAGES, message),
    ...upsert(CONVERSATIONS, { ...conversation, updatedAt: message.createdAt }),
  ])
  notifyConversations()
  return message
}

/** Lists a conversation's messages in the order they were written. */
export async function listMessages(conversationId: string): Promise<Message[]> {
  assert(conversationId, 'listMessages needs a conversationId')
  const messages = await store().getAllByIndex<Message>(
    MESSAGES,
    'conversationId',
    conversationId,
  )
  return messages.sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  )
}

/** Removes a conversation and the messages that belong to it. */
export async function deleteConversation(id: string): Promise<void> {
  assert(id, 'deleteConversation needs an id')
  const db = store()
  const messages = await db.getAllByIndex<Message>(
    MESSAGES,
    'conversationId',
    id,
  )
  const now = Date.now()
  // One commit, so an interrupted delete can't strand messages without
  // their conversation.
  await db.commit([
    ...messages.flatMap(removed(MESSAGES, now)),
    ...tombstone(CONVERSATIONS, id, now),
  ])
  notifyConversations()
}

// ── Sync ───────────────────────────────────────────────────────────────────

/** The changes waiting to be pushed, oldest first (see `outbox.ts`). */
export async function listOutbox(): Promise<OutboxEntry[]> {
  const entries = await store().getAll<OutboxEntry>(OUTBOX)
  return entries.sort((a, b) => a.seq - b.seq)
}

/** Reads one local record of a synced store, for the pusher to send. */
export async function getSyncedRecord<T extends { id: string }>(
  storeName: SyncedStoreName,
  id: string,
): Promise<T | undefined> {
  return store().get<T>(storeName, id)
}

/**
 * Removes a pushed entry, unless the record changed again while the push was
 * in flight (its `seq` moved on): then the newer change stays queued.
 * Resolves to whether the entry was removed.
 */
export async function acknowledgeOutbox(entry: OutboxEntry): Promise<boolean> {
  return store().guardedCommit(
    [{ storeName: OUTBOX, key: entry.id, field: 'seq', equals: entry.seq }],
    [{ type: 'remove', storeName: OUTBOX, key: entry.id }],
  )
}

interface SyncMetaRecord {
  id: string
  value: unknown
}

/** A value the sync engine keeps between runs, such as a pull cursor. */
export async function getSyncMeta<T>(key: string): Promise<T | undefined> {
  const record = await store().get<SyncMetaRecord>(SYNC_META, key)
  return record?.value as T | undefined
}

export async function setSyncMeta(key: string, value: unknown): Promise<void> {
  await store().put<SyncMetaRecord>(SYNC_META, { id: key, value })
}

/** A record as the engine pulls it: the local shape, typed loosely at runtime. */
export interface PulledRecord {
  id: string
  createdAt?: unknown
  updatedAt?: unknown
  chunks?: unknown
  [field: string]: unknown
}

const NOTIFY: Record<SyncedStoreName, () => void> = {
  [WORKSPACES]: () => notifyWorkspaces(),
  [DOCUMENTS]: () => notifyDocuments(),
  [CONVERSATIONS]: () => notifyConversations(),
  [MESSAGES]: () => notifyConversations(),
}

/**
 * Stores records pulled from the cloud, without queueing them for upload.
 * Last write wins: a record with a pending local change is only replaced if
 * the pulled copy is newer, and then the local change is dropped. A pulled
 * document without chunks keeps the local copy's chunks, since chunks never
 * change. Every check and write happens in one transaction per record, so an
 * edit made meanwhile is never overwritten. Resolves to how many were stored.
 */
export async function applyPulled(
  storeName: SyncedStoreName,
  records: readonly PulledRecord[],
): Promise<number> {
  const db = store()
  let applied = 0
  for (const record of records) {
    const outboxKey = `${storeName}:${record.id}`
    const [entry, local] = await Promise.all([
      db.get<OutboxEntry>(OUTBOX, outboxKey),
      db.get<PulledRecord>(storeName, record.id),
    ])
    const pulledAt = changedAt(record)
    let incoming = record
    if (storeName === DOCUMENTS && !Array.isArray(record.chunks)) {
      // The engine only fetches chunks for documents this device lacks.
      if (!local) continue
      incoming = { ...record, chunks: local.chunks }
    }

    if (entry) {
      // A local delete or a newer local edit wins and will be pushed.
      if (entry.op === 'delete' || entry.updatedAt >= pulledAt) continue
      const stored = await db.guardedCommit(
        [
          {
            storeName: OUTBOX,
            key: outboxKey,
            field: 'seq',
            equals: entry.seq,
          },
        ],
        [
          { type: 'put', storeName, record: incoming },
          { type: 'remove', storeName: OUTBOX, key: outboxKey },
        ],
      )
      if (stored) applied += 1
      continue
    }

    // Already up to date (pulls overlap, so the same copy can arrive twice).
    if (local && changedAt(local) >= pulledAt) continue
    const stored = await db.guardedCommit(
      [{ storeName: OUTBOX, key: outboxKey, field: 'seq', equals: undefined }],
      [{ type: 'put', storeName, record: incoming }],
    )
    if (stored) applied += 1
  }
  if (applied > 0) NOTIFY[storeName]()
  return applied
}

/**
 * Deletes a record another device deleted. It goes through the normal delete,
 * so the same cascade runs here (a document's emptied conversations go too)
 * and the device's pending changes to it are replaced by a tombstone.
 * Resolves to whether anything was deleted.
 */
export async function applyPulledDeletion(
  storeName: SyncedStoreName,
  id: string,
): Promise<boolean> {
  const db = store()
  if (!(await db.get(storeName, id))) return false
  if (storeName === WORKSPACES) await deleteWorkspace(id)
  else if (storeName === DOCUMENTS) await deleteDocument(id)
  else if (storeName === CONVERSATIONS) await deleteConversation(id)
  else {
    await db.commit(tombstone(MESSAGES, id, Date.now()))
    notifyConversations()
  }
  return true
}
