import { createIndexedDbAdapter } from './indexeddb-adapter.js'
import { CONVERSATIONS, DOCUMENTS, MESSAGES } from './schema.js'

export { createIndexedDbAdapter } from './indexeddb-adapter.js'
export { createMemoryAdapter } from './memory-adapter.js'
export {
  CONVERSATIONS,
  DB_NAME,
  DB_VERSION,
  DOCUMENTS,
  MESSAGES,
  STORES,
} from './schema.js'

let adapter

/**
 * Swaps the backing store; tests inject a fake one, the app leaves it alone.
 * Pass `null` to fall back to IndexedDB again.
 */
export function setStorageAdapter(next) {
  adapter = next ?? undefined
}

const store = () => (adapter ??= createIndexedDbAdapter())

const newId = () => crypto.randomUUID()

const assert = (value, message) => {
  if (!value) throw new TypeError(message)
  return value
}

/** Persists a parsed document, chunks and their `source` references included. */
export async function saveDocument(document) {
  assert(document?.id, 'saveDocument needs a document with an id')
  await store().put(DOCUMENTS, document)
  return document
}

/** Reads one stored document, or `undefined` when it is not held locally. */
export async function getDocument(id) {
  return store().get(DOCUMENTS, id)
}

/** Lists every stored document, ordered by name so the library reads predictably. */
export async function listDocuments() {
  const documents = await store().getAll(DOCUMENTS)
  return documents.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Removes a document together with its conversations and messages; orphaned
 * conversations would cite source references whose document is gone.
 */
export async function deleteDocument(id) {
  const conversations = await store().getAllByIndex(
    CONVERSATIONS,
    'documentId',
    id,
  )
  for (const conversation of conversations) {
    await store().removeByIndex(MESSAGES, 'conversationId', conversation.id)
  }
  await store().removeByIndex(CONVERSATIONS, 'documentId', id)
  await store().remove(DOCUMENTS, id)
}

/** Starts a conversation against a document and returns the stored record. */
export async function createConversation({
  documentId,
  title = 'Untitled conversation',
} = {}) {
  assert(documentId, 'createConversation needs a documentId')
  const now = Date.now()
  const conversation = {
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
export async function getConversation(id) {
  return store().get(CONVERSATIONS, id)
}

/** Lists a document's conversations, most recently updated first. */
export async function listConversations(documentId) {
  assert(documentId, 'listConversations needs a documentId')
  const conversations = await store().getAllByIndex(
    CONVERSATIONS,
    'documentId',
    documentId,
  )
  return conversations.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Renames a conversation and returns the updated record. */
export async function renameConversation(id, title) {
  const conversation = await store().get(CONVERSATIONS, id)
  if (!conversation) throw new Error(`No conversation "${id}"`)
  const updated = { ...conversation, title, updatedAt: Date.now() }
  await store().put(CONVERSATIONS, updated)
  return updated
}

/**
 * Appends a message to a conversation and touches the conversation so the
 * list stays ordered by recent activity.
 */
export async function appendMessage({
  conversationId,
  role,
  content,
  citations,
  answerable,
  createdAt,
} = {}) {
  assert(conversationId, 'appendMessage needs a conversationId')
  assert(
    role === 'user' || role === 'assistant',
    'appendMessage needs role "user" or "assistant"',
  )

  const conversation = await store().get(CONVERSATIONS, conversationId)
  if (!conversation) throw new Error(`No conversation "${conversationId}"`)

  const message = {
    id: newId(),
    conversationId,
    role,
    content,
    createdAt: createdAt ?? Date.now(),
  }
  // Grounding fields are assistant-only per ADR 0001; leaving them off user
  // messages keeps the stored shape honest about what was actually cited.
  if (role === 'assistant') {
    message.citations = citations ?? []
    message.answerable = answerable ?? false
  }

  await store().put(MESSAGES, message)
  await store().put(CONVERSATIONS, {
    ...conversation,
    updatedAt: message.createdAt,
  })
  return message
}

/** Lists a conversation's messages in the order they were written. */
export async function listMessages(conversationId) {
  assert(conversationId, 'listMessages needs a conversationId')
  const messages = await store().getAllByIndex(
    MESSAGES,
    'conversationId',
    conversationId,
  )
  return messages.sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  )
}

/** Removes a conversation and the messages that belong to it. */
export async function deleteConversation(id) {
  await store().removeByIndex(MESSAGES, 'conversationId', id)
  await store().remove(CONVERSATIONS, id)
}
