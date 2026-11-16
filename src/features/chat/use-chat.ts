import { useCallback, useEffect, useRef, useState } from 'react'
import {
  askQuestion,
  ChatError,
  DEFAULT_WAKE_RETRY_SECONDS,
} from './chat-client.ts'
import { resolveCitations } from './describe-source.ts'
import type { ResolvedCitation } from './describe-source.ts'
import type { ChatReply, StoredDocument } from '../../types/contracts.ts'

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

/**
 * `waking`: the model's server is starting (#201); the question is kept and
 * sent again automatically.
 */
export type ChatStatus = 'idle' | 'sending' | 'waking' | 'error'

/**
 * How long to keep retrying a waking model before handing control back to
 * the learner. A start normally takes about a minute; this leaves room for a
 * slow boot without leaving someone waiting indefinitely.
 */
export const MAX_WAKE_WAIT_MS = 4 * 60_000
/** Caps one wait between automatic retries. */
export const MAX_WAKE_RETRY_DELAY_MS = 45_000

export const WAKE_TIMED_OUT_MESSAGE =
  'The tutor is taking longer than usual to start. Try again in a minute.'

/**
 * The wait before automatic retry `attempt` (1-based): the server's hint,
 * growing by half each time so a slow start isn't polled at a fixed pace.
 */
export function wakeRetryDelayMs(
  attempt: number,
  retryAfterSeconds: number = DEFAULT_WAKE_RETRY_SECONDS,
): number {
  const growth = 1.5 ** Math.max(0, attempt - 1)
  return Math.min(MAX_WAKE_RETRY_DELAY_MS, retryAfterSeconds * 1000 * growth)
}

export interface ChatErrorState {
  message: string
  retryable: boolean
}

export interface UseChatOptions {
  documents?: readonly Pick<StoredDocument, 'id' | 'name'>[]
  /** The materials the server may draw on for this conversation. */
  materialIds?: readonly string[]
  /** A transcript restored from storage; read once, on first render. */
  initialMessages?: ChatTurn[]
  /** Runs after each answered question, e.g. to persist the exchange. */
  onAnswered?: (exchange: {
    question: string
    reply: ChatReply
  }) => void | Promise<void>
}

// Stable across renders, so a caller that omits materialIds doesn't rebuild `ask`.
const NO_MATERIALS: readonly string[] = []

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
  materialIds = NO_MATERIALS,
  initialMessages = [],
  onAnswered,
}: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatTurn[]>(initialMessages)
  const [status, setStatus] = useState<ChatStatus>('idle')
  const [error, setError] = useState<ChatErrorState | null>(null)
  // Mirrors `messages` so a send can read the history it was started with.
  const transcript = useRef<ChatTurn[]>(messages)
  // The question still awaiting a reply, so `retry` needs no re-typing.
  const unanswered = useRef<string | null>(null)
  const inFlight = useRef(false)
  // The current wait for a waking model: when it began, retries so far, and
  // the pending timer. Cleared on any answer or hand-back to the learner.
  const wake = useRef<{
    since: number
    attempt: number
    timer: ReturnType<typeof setTimeout> | null
  } | null>(null)
  // Lets the retry timer call the latest `ask` without re-arming on renders.
  const askRef = useRef<typeof ask | null>(null)

  const stopWaking = useCallback(() => {
    if (wake.current?.timer) clearTimeout(wake.current.timer)
    wake.current = null
  }, [])

  // A timer must not fire into an unmounted chat.
  useEffect(() => stopWaking, [stopWaking])

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
      // While the model wakes, only the scheduled retry may send.
      if (wake.current?.timer && !resend) return
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

      try {
        const reply = await askQuestion({
          question: trimmed,
          materialIds: [...materialIds],
          history,
        })
        append({
          id: nextId(),
          role: 'assistant',
          content: reply.answer,
          answerable: reply.answerable,
          // The server returns the passages it cited, so sources resolve even
          // when this device holds no copy of the material.
          citations: resolveCitations(
            reply.citations,
            reply.passages,
            documents,
          ),
        })
        unanswered.current = null
        stopWaking()
        setStatus('idle')
        // Saving is best-effort: the answer is already on screen, and a storage
        // failure must not turn a successful answer into an error.
        try {
          await onAnswered?.({ question: trimmed, reply })
        } catch (saveError) {
          console.error('Could not save the conversation', saveError)
        }
      } catch (failure) {
        if (failure instanceof ChatError && failure.code === 'model-waking') {
          const now = Date.now()
          const since = wake.current?.since ?? now
          const attempt = (wake.current?.attempt ?? 0) + 1
          const delay = wakeRetryDelayMs(attempt, failure.retryAfterSeconds)
          if (now + delay - since <= MAX_WAKE_WAIT_MS) {
            // The question stays in the transcript and in `unanswered`; the
            // learner sees a waiting state, not an error, and retypes nothing.
            const timer = setTimeout(() => {
              if (wake.current) wake.current.timer = null
              void askRef.current?.(unanswered.current, { resend: true })
            }, delay)
            wake.current = { since, attempt, timer }
            setStatus('waking')
            return
          }
          stopWaking()
          setError({ message: WAKE_TIMED_OUT_MESSAGE, retryable: true })
          setStatus('error')
          return
        }
        stopWaking()
        setError(toErrorState(failure))
        setStatus('error')
      } finally {
        inFlight.current = false
      }
    },
    [append, documents, materialIds, onAnswered, stopWaking],
  )
  useEffect(() => {
    askRef.current = ask
  }, [ask])

  const send = useCallback((question: string) => ask(question), [ask])

  const retry = useCallback(
    () => ask(unanswered.current, { resend: true }),
    [ask],
  )

  return { messages, status, error, send, retry }
}
