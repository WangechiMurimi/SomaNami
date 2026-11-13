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

/**
 * A retrievable passage of a document. `id` is `<documentId>:<index>`, unique
 * across documents, so a model citing it cannot point at the wrong file.
 */
export interface Chunk {
  id: string
  text: string
  source: Source
}

export type DocumentKind = 'pdf' | 'docx' | 'text'

/** A parsed, uploaded document as stored locally. */
/** A topic that groups materials and the conversations about them (US-08). */
export interface Workspace {
  id: string
  name: string
  topic: string
  description: string
  createdAt: number
  updatedAt: number
}

/** A parsed material before it is filed into a workspace. */
export interface NewDocument {
  id: string
  name: string
  size: number
  kind: DocumentKind
  pageCount: number | null
  chunks: Chunk[]
}

/** A material saved on this device; it belongs to exactly one workspace. */
export interface StoredDocument extends NewDocument {
  workspaceId: string
}

/** Identifies one chunk; `documentId` is carried so callers can join to the file. */
export interface ChunkRef {
  documentId: string
  chunkId: string
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

/**
 * A chat inside one workspace. `materialIds` are the workspace materials it
 * may draw on; retrieval never looks beyond them (US-08 AC3).
 */
export interface Conversation {
  id: string
  workspaceId: string
  materialIds: string[]
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
