/**
 * Data contracts shared by upload, storage, retrieval, chat and the server.
 * These types are the reference for every shape that crosses a module or
 * network boundary; change them deliberately and update every consumer.
 */

/** Where a chunk lives in its original file, in the unit each parser can cite. */
export type Source =
  | { type: 'page'; page: number }
  | { type: 'paragraph'; paragraph: number }
  | { type: 'line'; startLine: number; endLine: number }

/** A retrievable passage of a document. `id` is its index within the document. */
export interface Chunk {
  id: number
  text: string
  source: Source
}

export type DocumentKind = 'pdf' | 'docx' | 'text'

/** A parsed, uploaded document as stored locally. */
export interface StoredDocument {
  id: string
  name: string
  size: number
  kind: DocumentKind
  pageCount: number | null
  chunks: Chunk[]
}

/**
 * Identifies one chunk. `chunkId` is only unique within its document, so a
 * citation must always carry both fields.
 */
export interface ChunkRef {
  documentId: string
  chunkId: number
}

/** A chunk selected for a question, as sent to `POST /api/chat`. */
export interface Passage extends ChunkRef {
  text: string
  source: Source
}

/** A retrieval hit; `score` is normalised to 0..1 and comparable across queries. */
export interface RetrievedPassage extends Passage {
  score: number
}

export type Role = 'user' | 'assistant'

export interface HistoryTurn {
  role: Role
  content: string
}

/** Request body of `POST /api/chat`. */
export interface ChatRequest {
  question: string
  passages: Passage[]
  history: HistoryTurn[]
}

/**
 * Response body of `POST /api/chat`. `answerable: false` means the passages did
 * not support an answer, and the UI must say so rather than show a guess.
 */
export interface ChatReply {
  answer: string
  citations: ChunkRef[]
  answerable: boolean
}

export interface Conversation {
  id: string
  documentId: string
  title: string
  createdAt: number
  updatedAt: number
}

interface BaseMessage {
  id: string
  conversationId: string
  content: string
  createdAt: number
}

export interface UserMessage extends BaseMessage {
  role: 'user'
}

/** Grounding fields exist only on assistant messages. */
export interface AssistantMessage extends BaseMessage {
  role: 'assistant'
  citations: ChunkRef[]
  answerable: boolean
}

export type Message = UserMessage | AssistantMessage
