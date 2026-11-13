import { useCallback, useEffect, useState } from 'react'
import {
  appendMessage,
  getConversation,
  listMessages,
} from '../../lib/storage/index.ts'
import type {
  ChatReply,
  Conversation,
  StoredDocument,
} from '../../types/contracts.ts'
import { toChatTurns } from './conversation-materials.ts'
import type { ChatTurn } from './use-chat.ts'

export type ConversationState =
  | { status: 'loading' }
  | { status: 'missing' }
  | {
      status: 'ready' | 'history-error'
      conversation: Conversation
      initialMessages: ChatTurn[]
    }

/**
 * Loads a saved conversation and its messages, and saves each answered
 * exchange to it. `documents` resolves stored citations to material names;
 * mount keyed by conversation id so switching chats starts fresh.
 */
export function useConversation(
  conversationId: string,
  documents: readonly StoredDocument[],
) {
  const [state, setState] = useState<ConversationState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const conversation = await getConversation(conversationId)
      if (cancelled) return
      if (!conversation) {
        setState({ status: 'missing' })
        return
      }
      try {
        const messages = await listMessages(conversation.id)
        if (cancelled) return
        setState({
          status: 'ready',
          conversation,
          initialMessages: toChatTurns(messages, documents),
        })
      } catch (error) {
        if (cancelled) return
        // A broken history should not block asking new questions.
        console.error('Could not load the conversation', error)
        setState({ status: 'history-error', conversation, initialMessages: [] })
      }
    })().catch((error: unknown) => {
      if (cancelled) return
      console.error('Could not open the conversation', error)
      setState({ status: 'missing' })
    })
    return () => {
      cancelled = true
    }
    // Documents only label citations; reloading on every library change
    // would reset the transcript mid-conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  const record = useCallback(
    async ({ question, reply }: { question: string; reply: ChatReply }) => {
      const asked = Date.now()
      await appendMessage({
        conversationId,
        role: 'user',
        content: question,
        createdAt: asked,
      })
      await appendMessage({
        conversationId,
        role: 'assistant',
        content: reply.answer,
        citations: reply.citations,
        answerable: reply.answerable,
        // Strictly after the question, so the pair reloads in order even
        // when both are written within the same millisecond.
        createdAt: asked + 1,
      })
    },
    [conversationId],
  )

  return { state, record }
}
