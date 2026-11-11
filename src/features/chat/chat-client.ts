import type { ChatReply, ChatRequest } from '../../types/contracts.ts'

const ENDPOINT = '/api/chat'

const OFFLINE_MESSAGE =
  'We couldn’t reach the answer service. Check your connection and try again.'
const SERVER_MESSAGE =
  'The answer service had a problem answering that question.'
const MALFORMED_MESSAGE = 'The answer service sent something we couldn’t read.'

/** A chat failure the UI can present; `retryable` drives the retry affordance. */
export class ChatError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(
    message: string,
    {
      code = 'unknown',
      retryable = true,
      cause,
    }: { code?: string; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause })
    this.name = 'ChatError'
    this.code = code
    this.retryable = retryable
  }
}

/** Rejects replies that break the `ChatReply` contract so the UI never renders half an answer. */
function assertReply(payload: unknown): ChatReply {
  const valid =
    payload !== null &&
    typeof payload === 'object' &&
    typeof (payload as ChatReply).answer === 'string' &&
    typeof (payload as ChatReply).answerable === 'boolean' &&
    Array.isArray((payload as ChatReply).citations)
  if (!valid) {
    throw new ChatError(MALFORMED_MESSAGE, {
      code: 'malformed',
      retryable: false,
    })
  }
  return payload as ChatReply
}

/**
 * Asks `POST /api/chat` one grounded question and returns
 * `{ answer, citations, answerable }` (see `ChatReply`).
 */
export async function askQuestion({
  question,
  passages = [],
  history = [],
}: Pick<ChatRequest, 'question'> & Partial<ChatRequest>): Promise<ChatReply> {
  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, passages, history }),
    })
  } catch (cause) {
    throw new ChatError(OFFLINE_MESSAGE, { code: 'offline', cause })
  }

  if (!response.ok) {
    // 4xx will fail the same way on a retry, so only offer it for 5xx.
    throw new ChatError(SERVER_MESSAGE, {
      code: `http_${response.status}`,
      retryable: response.status >= 500,
    })
  }

  try {
    return assertReply(await response.json())
  } catch (cause) {
    if (cause instanceof ChatError) throw cause
    throw new ChatError(MALFORMED_MESSAGE, { code: 'malformed', cause })
  }
}
