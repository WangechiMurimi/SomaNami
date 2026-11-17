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
import { store } from './active-store.ts'
import { assert } from './assert.ts'
import { moveLegacyMaterials } from './import-legacy.ts'
import { tombstone, upsert } from './outbox.ts'
import {
  CONVERSATIONS,
  DEFAULT_WORKSPACE,
  DOCUMENTS,
  MESSAGES,
  WORKSPACES,
  isLooseWorkspace,
} from './schema.ts'
import type { SyncedStoreName } from './schema.ts'
import {
  notifyConversations,
  notifyDocuments,
  notifyWorkspaces,
} from './signals.ts'

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
  isLooseWorkspace,
  userDbName,
} from './schema.ts'
export type { StoreName, SyncedStoreName } from './schema.ts'
export {
  closeUserStore,
  isUserStoreOpen,
  openUserStore,
  removeUserStore,
  setStorageAdapter,
} from './active-store.ts'
export {
  subscribeToConversations,
  subscribeToDocuments,
  subscribeToWorkspaces,
} from './signals.ts'
export {
  acknowledgeOutbox,
  applyPulled,
  getSyncedRecord,
  getSyncMeta,
  listOutbox,
  setSyncMeta,
} from './sync.ts'
export type { PulledRecord } from './sync.ts'

/** Moves the materials from before accounts into the open user's store. */
export async function importLegacyMaterials(): Promise<void> {
  await moveLegacyMaterials({ target: store() })
  notifyDocuments()
  notifyWorkspaces()
  notifyConversations()
}

const newId = (): string => crypto.randomUUID()

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

/** Pins or unpins a workspace; pinned ones list first. */
export async function setWorkspacePinned(
  id: string,
  pinned: boolean,
): Promise<Workspace> {
  const workspace = await getWorkspace(id)
  if (!workspace) throw new Error(`No workspace "${id}"`)
  // Pinning is not activity, so the recency order stays as it was.
  const updated: Workspace = { ...workspace, pinned }
  await store().put(WORKSPACES, updated)
  notifyWorkspaces()
  return updated
}

/** Throws unless workspace `id` exists; the default one is created on first use. */
async function requireWorkspace(id: string): Promise<void> {
  const workspace = isLooseWorkspace(id)
    ? await ensureDefaultWorkspace()
    : await getWorkspace(id)
  if (!workspace) throw new Error(`No workspace "${id}"`)
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
  await requireWorkspace(workspaceId)
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

/**
 * Files a material into another workspace ("Add sources" / "Remove sources";
 * removing sends it to the default workspace, so it stays in the Library).
 * Chats in the workspace it leaves stop using it, keeping their history;
 * loose chats keep it, since they may use any material.
 */
export async function moveDocument(
  id: string,
  workspaceId: string,
): Promise<StoredDocument> {
  const db = store()
  const document = await db.get<StoredDocument>(DOCUMENTS, id)
  if (!document) throw new Error(`No document "${id}"`)
  await requireWorkspace(workspaceId)
  if (document.workspaceId === workspaceId) return document

  const left = isLooseWorkspace(document.workspaceId)
    ? []
    : (
        await db.getAllByIndex<Conversation>(CONVERSATIONS, 'materialIds', id)
      ).filter((c) => c.workspaceId === document.workspaceId)
  // `workspace_id` and `materialIds` sync, so every record this changes gets a
  // newer `updatedAt` and an outbox entry; otherwise the move never reaches
  // the cloud and last-write-wins could restore the old copies on a pull.
  const now = Date.now()
  const moved: StoredDocument = { ...document, workspaceId, updatedAt: now }
  await db.commit([
    ...left.flatMap((conversation) => {
      const record: Conversation = {
        ...conversation,
        materialIds: conversation.materialIds.filter((m) => m !== id),
        updatedAt: now,
      }
      return upsert(CONVERSATIONS, record)
    }),
    ...upsert(DOCUMENTS, moved),
  ])
  if (left.length > 0) notifyConversations()
  return moved
}

// ── Conversations ──────────────────────────────────────────────────────────

export interface NewConversation {
  workspaceId?: string
  materialIds?: readonly string[]
  title?: string
}

/**
 * Starts a conversation over chosen, stored materials. In a user's workspace
 * every material must belong to that workspace, so the chat can never draw on
 * another workspace's materials (US-08 AC3). A loose chat (the default
 * workspace) may use any material, such as a Library file from a workspace.
 */
export async function createConversation({
  workspaceId,
  materialIds = [],
  title = 'Untitled conversation',
}: NewConversation = {}): Promise<Conversation> {
  assert(workspaceId, 'createConversation needs a workspaceId')
  assert(materialIds.length > 0, 'createConversation needs materialIds')
  const loose = isLooseWorkspace(workspaceId)
  const materials = await Promise.all(materialIds.map(getDocument))
  materials.forEach((material, index) => {
    if (loose ? !material : material?.workspaceId !== workspaceId) {
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

/** Saves or unsaves a conversation for Saved conversations. */
export async function setConversationSaved(
  id: string,
  saved: boolean,
): Promise<Conversation> {
  const db = store()
  const conversation = await db.get<Conversation>(CONVERSATIONS, id)
  if (!conversation) throw new Error(`No conversation "${id}"`)
  // Saving is not activity: Recents keep their order.
  const updated: Conversation = { ...conversation, saved }
  await db.put(CONVERSATIONS, updated)
  notifyConversations()
  return updated
}

/** Lists saved conversations from every workspace, most recently updated first. */
export async function listSavedConversations(): Promise<Conversation[]> {
  const conversations = await store().getAll<Conversation>(CONVERSATIONS)
  return conversations.filter(({ saved }) => saved).sort(byRecentActivity)
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
