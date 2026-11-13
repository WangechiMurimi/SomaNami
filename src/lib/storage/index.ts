import type {
  AssistantMessage,
  ChunkRef,
  Conversation,
  Message,
  Role,
  StoredDocument,
  UserMessage,
} from '../../types/contracts.ts'
import type { StorageAdapter } from './adapter.ts'
import { createIndexedDbAdapter, deleteDatabase } from './indexeddb-adapter.ts'
import { createMemoryAdapter } from './memory-adapter.ts'
import { CONVERSATIONS, DOCUMENTS, MESSAGES, userDbName } from './schema.ts'

export type { StorageAdapter, StorageRecord } from './adapter.ts'
export { createIndexedDbAdapter } from './indexeddb-adapter.ts'
export { createMemoryAdapter } from './memory-adapter.ts'
export {
  CONVERSATIONS,
  DB_NAME,
  DB_VERSION,
  DOCUMENTS,
  MESSAGES,
  STORES,
  userDbName,
} from './schema.ts'

let injected: StorageAdapter | undefined

interface UserStore {
  userId: string
  adapter: StorageAdapter
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
  await opening.adapter.get(DOCUMENTS, '')
  // Closed or switched while it was opening: don't keep a connection that
  // would block deleting this user's database.
  if (current !== opening) await opening.adapter.close()
}

/** Closes the current user's store on sign-out or user switch. */
export function closeUserStore(): void {
  const closing = current
  current = undefined
  void closing?.adapter.close()
}

/** Deletes one user's materials from this device, for shared computers. */
export async function removeUserStore(userId: string): Promise<void> {
  if (current?.userId === userId) {
    const closing = current
    current = undefined
    // The delete waits on every open connection, ours included.
    await closing.adapter.close()
  }
  memoryStores.delete(userId)
  const factory = globalThis.indexedDB
  if (factory) await deleteDatabase(factory, userDbName(userId))
}

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

const newId = (): string => crypto.randomUUID()

// Types guard compile-time callers; these guard data that arrives untyped at
// runtime, where a missing id would otherwise corrupt an index lookup.
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new TypeError(message)
}

/** Persists a parsed document, chunks and their `source` references included. */
export async function saveDocument(
  document: StoredDocument,
): Promise<StoredDocument> {
  assert(document?.id, 'saveDocument needs a document with an id')
  await store().put(DOCUMENTS, document)
  return document
}

/** Reads one stored document, or `undefined` when it is not held locally. */
export async function getDocument(
  id: string,
): Promise<StoredDocument | undefined> {
  return store().get<StoredDocument>(DOCUMENTS, id)
}

/** Lists every stored document, ordered by name so the library reads predictably. */
export async function listDocuments(): Promise<StoredDocument[]> {
  const documents = await store().getAll<StoredDocument>(DOCUMENTS)
  return documents.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Removes a document together with its conversations and messages; orphaned
 * conversations would cite source references whose document is gone. The
 * deletes run as one batch so an interrupted delete cannot leave orphans.
 */
export async function deleteDocument(id: string): Promise<void> {
  const conversations = await store().getAllByIndex<Conversation>(
    CONVERSATIONS,
    'documentId',
    id,
  )
  const messageGroups = await Promise.all(
    conversations.map((conversation) =>
      store().getAllByIndex<Message>(
        MESSAGES,
        'conversationId',
        conversation.id,
      ),
    ),
  )
  await store().removeMany([
    ...messageGroups.flat().map((message) => ({
      storeName: MESSAGES,
      key: message.id,
    })),
    ...conversations.map((conversation) => ({
      storeName: CONVERSATIONS,
      key: conversation.id,
    })),
    { storeName: DOCUMENTS, key: id },
  ])
}

/** Starts a conversation against a document and returns the stored record. */
export async function createConversation({
  documentId,
  title = 'Untitled conversation',
}: { documentId?: string; title?: string } = {}): Promise<Conversation> {
  assert(documentId, 'createConversation needs a documentId')
  const now = Date.now()
  const conversation: Conversation = {
    id: newId(),
    documentId,
    title,
    createdAt: now,
    updatedAt: now,
  }
  await store().put(CONVERSATIONS, conversation)
  return conversation
}

/** Reads one conversation, or `undefined` when it is not held locally. */
export async function getConversation(
  id: string,
): Promise<Conversation | undefined> {
  return store().get<Conversation>(CONVERSATIONS, id)
}

/** Lists a document's conversations, most recently updated first. */
export async function listConversations(
  documentId: string,
): Promise<Conversation[]> {
  assert(documentId, 'listConversations needs a documentId')
  const conversations = await store().getAllByIndex<Conversation>(
    CONVERSATIONS,
    'documentId',
    documentId,
  )
  return conversations.sort((a, b) => b.updatedAt - a.updatedAt)
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
}
