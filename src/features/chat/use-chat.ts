import { useCallback, useRef, useState } from 'react'
import { askQuestion, ChatError } from './chat-client.ts'
import { resolveCitations } from './describe-source.ts'
import type { ResolvedCitation } from './describe-source.ts'
import type { Passage, StoredDocument } from '../../types/contracts.ts'

/** A transcript entry as the UI renders it, with citations already resolved. */
export type ChatTurn =
  | { id: string; role: 'user'; content: string }
  | {
      id: string
      role: 'assistant'
      content: string
      answerable: boolean
      citations: ResolvedCitation[]
    }

export type ChatStatus = 'idle' | 'sending' | 'error'

export interface ChatErrorState {
  message: string
  retryable: boolean
}

export interface UseChatOptions {
  documents?: readonly Pick<StoredDocument, 'id' | 'name'>[]
  selectPassages?: (question: string) => Passage[]
}

let messageCount = 0
const nextId = (): string => `chat-message-${++messageCount}`

/** Shapes any thrown value into the error the UI shows; unexpected ones are logged, not leaked. */
function toErrorState(error: unknown): ChatErrorState {
  if (error instanceof ChatError) {
    return { message: error.message, retryable: error.retryable }
  }
  // Not a failure we anticipated, so keep the details for debugging.
  console.error('Unexpected chat failure', error)
  return {
    message: 'Something went wrong while answering that question.',
    retryable: true,
  }
}

/**
 * Runs one document conversation: the transcript, the in-flight state, and a
 * retryable error that keeps the unanswered question in place.
 */
export function useChat({
  documents = [],
  selectPassages,
}: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatTurn[]>([])
  const [status, setStatus] = useState<ChatStatus>('idle')
  const [error, setError] = useState<ChatErrorState | null>(null)
  // Mirrors `messages` so a send can read the history it was started with.
  const transcript = useRef<ChatTurn[]>([])
  // The question still awaiting a reply, so `retry` needs no re-typing.
  const unanswered = useRef<string | null>(null)
  const inFlight = useRef(false)

  const append = useCallback((message: ChatTurn) => {
    transcript.current = [...transcript.current, message]
    setMessages(transcript.current)
  }, [])

  const ask = useCallback(
    async (
      question: string | null | undefined,
      { resend = false }: { resend?: boolean } = {},
    ) => {
      const trimmed = question?.trim() ?? ''
      if (!trimmed || inFlight.current) return
      inFlight.current = true
      unanswered.current = trimmed
      setError(null)
      setStatus('sending')

      // On a retry the question is already in the transcript, so it is the
      // current turn rather than history.
      const prior = transcript.current
      const history = (
        resend && prior.at(-1)?.role === 'user' ? prior.slice(0, -1) : prior
      ).map(({ role, content }) => ({ role, content }))

      if (!resend) {
        append({ id: nextId(), role: 'user', content: trimmed })
      }

      const passages = selectPassages ? selectPassages(trimmed) : []

      try {
        const reply = await askQuestion({
          question: trimmed,
          passages,
          history,
        })
        append({
          id: nextId(),
          role: 'assistant',
          content: reply.answer,
          answerable: reply.answerable,
          citations: resolveCitations(reply.citations, passages, documents),
        })
        unanswered.current = null
        setStatus('idle')
      } catch (failure) {
        setError(toErrorState(failure))
        setStatus('error')
      } finally {
        inFlight.current = false
      }
    },
    [append, documents, selectPassages],
  )

  const send = useCallback((question: string) => ask(question), [ask])

  const retry = useCallback(
    () => ask(unanswered.current, { resend: true }),
    [ask],
  )

  return { messages, status, error, send, retry }
}
