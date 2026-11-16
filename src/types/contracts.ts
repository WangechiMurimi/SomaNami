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

export type DocumentKind = 'pdf' | 'docx' | 'text' | 'web'

/** A parsed, uploaded document as stored locally. */
/** A topic that groups materials and the conversations about them (US-08). */
export interface Workspace {
  id: string
  name: string
  topic: string
  description: string
  /** Shown first in the workspace list; absent on records made before pinning. */
  pinned?: boolean
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
  /** The link a material was fetched from; absent for uploads and pasted text. */
  sourceUrl?: string
  /** When `sourceUrl` was fetched (epoch ms); the page may have changed since. */
  fetchedAt?: number
}

/** A material saved on this device; it belongs to exactly one workspace. */
export interface StoredDocument extends NewDocument {
  workspaceId: string
  /** Where the original file is in the `materials` bucket, once uploaded (#145). */
  storagePath?: string
  /** Client clock, epoch ms; `updatedAt` decides last-write-wins in sync. */
  createdAt: number
  updatedAt: number
}

/** Identifies one chunk; `documentId` is carried so callers can join to the file. */
export interface ChunkRef {
  documentId: string
  chunkId: string
}

/** A chunk with its text and location, as retrieval returns it. */
export interface Passage extends ChunkRef {
  text: string
  source: Source
}

/** A retrieval hit; `score` is normalised to 0..1 and comparable across queries. */
export interface RetrievedPassage extends Passage {
  score: number
}

/**
 * Request body of `POST /api/fetch-link`. The server only fetches; the browser
 * parses the returned bytes like an upload. A success is the raw body with its
 * `Content-Type`, the post-redirect URL in `X-Final-Url`, and a suggested file
 * name in `Content-Disposition`. A failure is JSON `FetchLinkFailure`.
 */
export interface FetchLinkRequest {
  url: string
}

/** Why a link could not be fetched; each maps to a message with a fallback. */
export type FetchLinkErrorCode =
  | 'invalid-url'
  | 'video-not-supported'
  | 'blocked-address'
  | 'unreachable'
  | 'timeout'
  | 'too-many-redirects'
  | 'login-or-paywall'
  | 'unsupported-type'
  | 'too-large'
  | 'rate-limited'
  | 'unauthorized'
  | 'not-configured'

/** Error body of `POST /api/fetch-link`. */
export interface FetchLinkFailure {
  error: FetchLinkErrorCode
}

/** Response header carrying the URL the bytes came from after redirects. */
export const FINAL_URL_HEADER = 'X-Final-Url'

export type Role = 'user' | 'assistant'

export interface HistoryTurn {
  role: Role
  content: string
}

/**
 * Request body of `POST /api/chat` (#148). The client names the materials the
 * conversation may draw on; the server loads and ranks their chunks itself,
 * as the signed-in user, so it never trusts passages a client claims to have.
 */
export interface ChatRequest {
  question: string
  materialIds: string[]
  history: HistoryTurn[]
}

/** A passage an answer cites, with the name of the material it came from. */
export interface CitedPassage extends Passage {
  documentName: string
}

/**
 * Response body of `POST /api/chat`. `answerable: false` means the passages did
 * not support an answer, and the UI must say so rather than show a guess.
 * `passages` holds exactly the cited passages, one per citation, so the client
 * can show sources it may not hold locally.
 */
export interface ChatReply {
  answer: string
  citations: ChunkRef[]
  answerable: boolean
  passages: CitedPassage[]
}

/**
 * A chat. `materialIds` are the only materials it may draw on; retrieval never
 * looks beyond them. A chat in a user's workspace may use only that
 * workspace's materials (US-08 AC3). A loose chat, started outside any
 * workspace, lives in the default workspace and may use any material.
 */
export interface Conversation {
  id: string
  workspaceId: string
  materialIds: string[]
  title: string
  /** Listed under Saved conversations; absent on records made before saving. */
  saved?: boolean
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
