import type {
  Conversation,
  Message,
  NewDocument,
  Passage,
  StoredDocument,
} from '../../types/contracts.ts'
import { resolveCitations } from './describe-source.ts'
import type { ChatTurn } from './use-chat.ts'

const TITLE_CHARS = 60

/**
 * The materials a conversation may draw on: only those it chose, and only
 * from its own workspace, so retrieval can never cross into another
 * workspace's materials (US-08 AC3).
 */
export function materialsFor(
  conversation: Pick<Conversation, 'workspaceId' | 'materialIds'>,
  documents: readonly StoredDocument[],
): StoredDocument[] {
  const chosen = new Set(conversation.materialIds)
  return documents.filter(
    ({ id, workspaceId }) =>
      chosen.has(id) && workspaceId === conversation.workspaceId,
  )
}

/** Every chunk of the given documents as citable passages. */
export function toPassages(documents: readonly NewDocument[]): Passage[] {
  return documents.flatMap((document) =>
    document.chunks.map(({ id, text, source }) => ({
      documentId: document.id,
      chunkId: id,
      text,
      source,
    })),
  )
}

/** Rebuilds what the chat shows from stored messages and their materials. */
export function toChatTurns(
  messages: readonly Message[],
  documents: readonly NewDocument[],
): ChatTurn[] {
  const passages = toPassages(documents)
  return messages.map((message) =>
    message.role === 'user'
      ? { id: message.id, role: 'user', content: message.content }
      : {
          id: message.id,
          role: 'assistant',
          content: message.content,
          answerable: message.answerable,
          citations: resolveCitations(message.citations, passages, documents),
        },
  )
}

/** A conversation title from its first question. */
export const titleFrom = (question: string): string => {
  const trimmed = question.trim()
  return trimmed.length > TITLE_CHARS
    ? `${trimmed.slice(0, TITLE_CHARS - 1)}…`
    : trimmed
}

/** Where a saved conversation opens. */
export const chatPath = ({ id }: Pick<Conversation, 'id'>): string =>
  `/chats/${id}`

/** The New chat screen for a workspace, optionally with one material chosen. */
export const newChatPath = (workspaceId: string, materialId?: string): string =>
  `/workspaces/${workspaceId}/chats/new${
    materialId ? `?material=${encodeURIComponent(materialId)}` : ''
  }`
