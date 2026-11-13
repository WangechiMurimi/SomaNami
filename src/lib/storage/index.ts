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
import { createIndexedDbAdapter } from './indexeddb-adapter.ts'
import { createMemoryAdapter } from './memory-adapter.ts'
import {
  CONVERSATIONS,
  DEFAULT_WORKSPACE,
  DOCUMENTS,
  MESSAGES,
  WORKSPACES,
} from './schema.ts'

export type { Change, StorageAdapter, StorageRecord } from './adapter.ts'
export { createIndexedDbAdapter } from './indexeddb-adapter.ts'
export { createMemoryAdapter } from './memory-adapter.ts'
export {
  CONVERSATIONS,
  DB_NAME,
  DB_VERSION,
  DEFAULT_WORKSPACE,
  DOCUMENTS,
  MESSAGES,
  STORES,
  WORKSPACES,
} from './schema.ts'

let adapter: StorageAdapter | undefined

/**
 * Swaps the backing store; tests inject a fake one, the app leaves it alone.
 * Pass `null` to fall back to IndexedDB again.
 */
export function setStorageAdapter(next: StorageAdapter | null): void {
  adapter = next ?? undefined
}

// TODO(#114): WS-D gives each user a private database and makes storage calls
// fail while no user store is open. Until then these keep the shared store.

/** Opens the signed-in user's private store; later storage calls read and write it. */
export async function openUserStore(userId: string): Promise<void> {
  void userId
}

/** Closes the current user's store on sign-out or user switch. */
export function closeUserStore(): void {}

/** Deletes one user's materials from this device, for shared computers. */
export async function removeUserStore(userId: string): Promise<void> {
  void userId
}

// Some browsers (and private-browsing modes) expose no IndexedDB; the app
// still works for the session, it just cannot keep documents across reloads.
const store = (): StorageAdapter =>
  (adapter ??= globalThis.indexedDB
    ? createIndexedDbAdapter()
    : createMemoryAdapter())

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
const notifyConversations = conversationSignal.notify
const notifyWorkspaces = workspaceSignal.notify

/**
 * Calls `listener` after any conversation is created, changed or removed, so
 * lists such as the sidebar's recent chats stay current without polling.
 * Returns the unsubscribe function.
 */
export const subscribeToConversations = conversationSignal.subscribe

/** As `subscribeToConversations`, for workspaces. */
export const subscribeToWorkspaces = workspaceSignal.subscribe

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
  await store().put(WORKSPACES, workspace)
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
  await store().put(WORKSPACES, updated)
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
  await store().put(WORKSPACES, workspace)
  notifyWorkspaces()
  return workspace
}

/**
 * Removes a workspace with every material, conversation and message in it,
 * in one batch so an interrupted delete cannot leave orphans behind.
 */
export async function deleteWorkspace(id: string): Promise<void> {
  assert(id, 'deleteWorkspace needs an id')
  const [documents, conversations] = await Promise.all([
    store().getAllByIndex<StoredDocument>(DOCUMENTS, 'workspaceId', id),
    store().getAllByIndex<Conversation>(CONVERSATIONS, 'workspaceId', id),
  ])
  const messages = await messagesOf(conversations)
  await store().commit([
    ...messages.map(remove(MESSAGES)),
    ...conversations.map(remove(CONVERSATIONS)),
    ...documents.map(remove(DOCUMENTS)),
    { type: 'remove', storeName: WORKSPACES, key: id },
  ])
  notifyWorkspaces()
  if (conversations.length > 0) notifyConversations()
}

const remove =
  (storeName: Change['storeName']) =>
  ({ id }: { id: string }): Change => ({ type: 'remove', storeName, key: id })

const messagesOf = async (conversations: readonly Conversation[]) =>
  (
    await Promise.all(
      conversations.map(({ id }) =>
        store().getAllByIndex<Message>(MESSAGES, 'conversationId', id),
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
  const stored: StoredDocument = { ...document, workspaceId }
  await store().put(DOCUMENTS, stored)
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
  const conversations = await store().getAllByIndex<Conversation>(
    CONVERSATIONS,
    'materialIds',
    id,
  )
  const emptied = conversations.filter(({ materialIds }) =>
    materialIds.every((materialId) => materialId === id),
  )
  const kept = conversations.filter((c) => !emptied.includes(c))
  const messages = await messagesOf(emptied)
  await store().commit([
    ...messages.map(remove(MESSAGES)),
    ...emptied.map(remove(CONVERSATIONS)),
    ...kept.map((conversation): Change => {
      const record: Conversation = {
        ...conversation,
        materialIds: conversation.materialIds.filter((m) => m !== id),
      }
      return { type: 'put', storeName: CONVERSATIONS, record }
    }),
    { type: 'remove', storeName: DOCUMENTS, key: id },
  ])
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
  await store().put(CONVERSATIONS, conversation)
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
  const conversation = await store().get<Conversation>(CONVERSATIONS, id)
  if (!conversation) throw new Error(`No conversation "${id}"`)
  const updated = { ...conversation, title, updatedAt: Date.now() }
  await store().put(CONVERSATIONS, updated)
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
  assert(conversationId, 'appendMessage needs a conversationId')
  assert(
    role === 'user' || role === 'assistant',
    'appendMessage needs role "user" or "assistant"',
  )

  const conversation = await store().get<Conversation>(
    CONVERSATIONS,
    conversationId,
  )
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

  await store().put(MESSAGES, message)
  await store().put(CONVERSATIONS, {
    ...conversation,
    updatedAt: message.createdAt,
  })
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
  await store().removeByIndex(MESSAGES, 'conversationId', id)
  await store().remove(CONVERSATIONS, id)
  notifyConversations()
}
