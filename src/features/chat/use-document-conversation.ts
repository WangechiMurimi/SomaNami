import { useCallback, useEffect, useRef, useState } from 'react'
import {
  appendMessage,
  createConversation,
  listConversations,
  listMessages,
} from '../../lib/storage/index.ts'
import type {
  ChatReply,
  Message,
  Passage,
  StoredDocument,
} from '../../types/contracts.ts'
import { resolveCitations } from './describe-source.ts'
import type { ChatTurn } from './use-chat.ts'

const TITLE_CHARS = 60

/** Every chunk of a document as a citable passage. */
export function toPassages(document: StoredDocument): Passage[] {
  return document.chunks.map(({ id, text, source }) => ({
    documentId: document.id,
    chunkId: id,
    text,
    source,
  }))
}

/** Rebuilds what the chat shows from stored messages and their document. */
export function toChatTurns(
  messages: readonly Message[],
  document: StoredDocument,
): ChatTurn[] {
  const passages = toPassages(document)
  return messages.map((message) =>
    message.role === 'user'
      ? { id: message.id, role: 'user', content: message.content }
      : {
          id: message.id,
          role: 'assistant',
          content: message.content,
          answerable: message.answerable,
          citations: resolveCitations(message.citations, passages, [document]),
        },
  )
}

const titleFrom = (question: string) =>
  question.length > TITLE_CHARS
    ? `${question.slice(0, TITLE_CHARS - 1)}…`
    : question

export type ConversationStatus = 'loading' | 'ready' | 'error'

/**
 * Restores a document's most recent conversation and saves each answered
 * exchange to it. The conversation is created on the first question, so
 * opening a document never leaves an empty conversation behind. Mount it
 * keyed by `document.id`.
 */
export function useDocumentConversation(document: StoredDocument) {
  const [status, setStatus] = useState<ConversationStatus>('loading')
  const [initialMessages, setInitialMessages] = useState<ChatTurn[]>([])
  const conversationId = useRef<string | null>(null)

  useEffect(() => {
    // Callers key this hook's component by document id, so a different
    // document remounts it and status starts from 'loading' again.
    let cancelled = false
    conversationId.current = null
    ;(async () => {
      const [latest] = await listConversations(document.id)
      const messages = latest ? await listMessages(latest.id) : []
      if (cancelled) return
      conversationId.current = latest?.id ?? null
      setInitialMessages(toChatTurns(messages, document))
      setStatus('ready')
    })().catch((error: unknown) => {
      if (cancelled) return
      // A broken history should not block asking new questions.
      console.error('Could not load the conversation', error)
      setInitialMessages([])
      setStatus('error')
    })
    return () => {
      cancelled = true
    }
  }, [document])

  const record = useCallback(
    async ({ question, reply }: { question: string; reply: ChatReply }) => {
      if (!conversationId.current) {
        const conversation = await createConversation({
          documentId: document.id,
          title: titleFrom(question),
        })
        conversationId.current = conversation.id
      }
      const id = conversationId.current
      const asked = Date.now()
      await appendMessage({
        conversationId: id,
        role: 'user',
        content: question,
        createdAt: asked,
      })
      await appendMessage({
        conversationId: id,
        role: 'assistant',
        content: reply.answer,
        citations: reply.citations,
        answerable: reply.answerable,
        // Strictly after the question, so the pair reloads in order even
        // when both are written within the same millisecond.
        createdAt: asked + 1,
      })
    },
    [document.id],
  )

  return { status, initialMessages, record }
}
