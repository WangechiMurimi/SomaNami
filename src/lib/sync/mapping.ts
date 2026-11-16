import type {
  Chunk,
  Conversation,
  Message,
  Source,
  StoredDocument,
  Workspace,
} from '../../types/contracts.ts'
import type { ChunkRow, Row } from './cloud.ts'

// Conversions between device records (src/types/contracts.ts) and cloud rows
// (supabase/migrations/*_storage_schema.sql). Optional fields are left off
// rather than set to null, so a pulled record has the same shape as one made
// on this device.

/**
 * Link fields from #93 (#157). Declared here so links sync whether or not that
 * stack has reached this branch; `StoredDocument` gains them when it lands.
 */
type LinkFields = { sourceUrl?: string; fetchedAt?: number }

const optional = <T>(value: T | null | undefined): T | undefined =>
  value === null ? undefined : value

export function workspaceToRow(workspace: Workspace): Row {
  return {
    id: workspace.id,
    name: workspace.name,
    topic: workspace.topic,
    description: workspace.description,
    created_at: workspace.createdAt,
    updated_at: workspace.updatedAt,
  }
}

export function rowToWorkspace(row: Row): Workspace {
  return {
    id: row.id,
    name: String(row.name),
    topic: String(row.topic),
    description: String(row.description),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function documentToRow(stored: StoredDocument): Row {
  const document: StoredDocument & LinkFields = stored
  return {
    id: document.id,
    workspace_id: document.workspaceId,
    name: document.name,
    size: document.size,
    kind: document.kind,
    page_count: document.pageCount,
    source_url: document.sourceUrl ?? null,
    fetched_at: document.fetchedAt ?? null,
    storage_path: document.storagePath ?? null,
    created_at: document.createdAt,
    updated_at: document.updatedAt,
  }
}

/** A pulled document; `chunks` is filled in separately, only when needed. */
export function rowToDocument(
  row: Row,
): Omit<StoredDocument, 'chunks'> & LinkFields {
  const document: Omit<StoredDocument, 'chunks'> & LinkFields = {
    id: row.id,
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    size: Number(row.size),
    kind: row.kind as StoredDocument['kind'],
    pageCount: row.page_count === null ? null : Number(row.page_count),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
  const sourceUrl = optional(row.source_url as string | null)
  const fetchedAt = optional(row.fetched_at as number | null)
  const storagePath = optional(row.storage_path as string | null)
  if (sourceUrl !== undefined) document.sourceUrl = sourceUrl
  if (fetchedAt !== undefined) document.fetchedAt = Number(fetchedAt)
  if (storagePath !== undefined) document.storagePath = storagePath
  return document
}

export function chunksToRows(document: StoredDocument): ChunkRow[] {
  return document.chunks.map((chunk, position) => ({
    id: chunk.id,
    document_id: document.id,
    position,
    text: chunk.text,
    source: chunk.source,
  }))
}

export function rowToChunk(row: ChunkRow): Chunk {
  return { id: row.id, text: row.text, source: row.source as Source }
}

export function conversationToRow(conversation: Conversation): Row {
  return {
    id: conversation.id,
    workspace_id: conversation.workspaceId,
    title: conversation.title,
    created_at: conversation.createdAt,
    updated_at: conversation.updatedAt,
  }
}

/** A pulled conversation; `materialIds` comes from its material rows. */
export function rowToConversation(
  row: Row,
  materialIds: string[],
): Conversation {
  return {
    id: row.id,
    workspaceId: String(row.workspace_id),
    materialIds,
    title: String(row.title),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function messageToRow(message: Message): Row {
  return {
    id: message.id,
    conversation_id: message.conversationId,
    role: message.role,
    content: message.content,
    citations: message.role === 'assistant' ? message.citations : [],
    answerable: message.role === 'assistant' ? message.answerable : null,
    created_at: message.createdAt,
  }
}

export function rowToMessage(row: Row): Message {
  const base = {
    id: row.id,
    conversationId: String(row.conversation_id),
    content: String(row.content),
    createdAt: Number(row.created_at),
  }
  // Grounding fields exist only on assistant messages, as on the device.
  return row.role === 'assistant'
    ? {
        ...base,
        role: 'assistant',
        citations: Array.isArray(row.citations) ? row.citations : [],
        answerable: row.answerable === true,
      }
    : { ...base, role: 'user' }
}
