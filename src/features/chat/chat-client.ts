import { getAccessToken, isOffline } from '../../lib/auth/access-token.ts'
import type {
  ChatReply,
  ChatRequest,
  CitedPassage,
} from '../../types/contracts.ts'

const ENDPOINT = '/api/chat'

// Users are treated as always online, so a failed request is just a failed
// request: one plain message whether the network or the server let us down.
export const FAILED_MESSAGE = 'Couldn’t get an answer. Try again.'
const REJECTED_MESSAGE = 'Couldn’t get an answer to that question.'
const MALFORMED_MESSAGE = 'The answer service sent something we couldn’t read.'
export const SESSION_ENDED_MESSAGE =
  'Your session ended. Sign in again to ask questions.'
export const RATE_LIMITED_MESSAGE =
  'You’re asking quickly. Wait a moment and try again.'

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

/** True for a cited passage the UI can label and quote. */
function isCitedPassage(value: unknown): value is CitedPassage {
  if (value === null || typeof value !== 'object') return false
  const passage = value as CitedPassage
  return (
    typeof passage.documentId === 'string' &&
    typeof passage.chunkId === 'string' &&
    typeof passage.documentName === 'string' &&
    typeof passage.text === 'string' &&
    passage.source !== null &&
    typeof passage.source === 'object'
  )
}

/** Rejects replies that break the `ChatReply` contract so the UI never renders half an answer. */
function assertReply(payload: unknown): ChatReply {
  const reply = payload as ChatReply
  const valid =
    payload !== null &&
    typeof payload === 'object' &&
    typeof reply.answer === 'string' &&
    typeof reply.answerable === 'boolean' &&
    Array.isArray(reply.citations) &&
    // The server sends the cited passages so sources show even for materials
    // this device doesn't hold.
    Array.isArray(reply.passages) &&
    reply.passages.every(isCitedPassage)
  if (!valid) {
    throw new ChatError(MALFORMED_MESSAGE, {
      code: 'malformed',
      retryable: false,
    })
  }
  return payload as ChatReply
}

/**
 * Asks `POST /api/chat` one grounded question about the named materials and
 * returns `{ answer, citations, answerable, passages }` (see `ChatReply`). The
 * server loads and ranks the materials itself; no document text is sent.
 */
export async function askQuestion({
  question,
  materialIds = [],
  history = [],
}: Pick<ChatRequest, 'question'> & Partial<ChatRequest>): Promise<ChatReply> {
  const body = JSON.stringify({ question, materialIds, history })

  // Without a session the server can only refuse, so don't spend a request
  // (or a slot of the per-IP rate limit) finding that out.
  const token = await getAccessToken()
  if (!token) {
    throw isOffline()
      ? new ChatError(FAILED_MESSAGE, { code: 'network' })
      : sessionEnded()
  }

  let response = await post(body, token)
  if (response.status === 401) {
    // Access tokens are short-lived, so one may expire between the client's
    // auto-refresh and this request. Refresh once; a second 401 means the
    // session itself is gone, and retrying again would only loop.
    const fresh = await getAccessToken({ refresh: true })
    if (fresh) response = await post(body, fresh)
    if (!fresh || response.status === 401) throw sessionEnded()
  }

  if (response.status === 429) {
    throw new ChatError(RATE_LIMITED_MESSAGE, { code: 'rate-limited' })
  }

  if (!response.ok) {
    // 4xx will fail the same way on a retry, so only offer it for 5xx.
    const retryable = response.status >= 500
    throw new ChatError(retryable ? FAILED_MESSAGE : REJECTED_MESSAGE, {
      code: `http_${response.status}`,
      retryable,
    })
  }

  try {
    return assertReply(await response.json())
  } catch (cause) {
    if (cause instanceof ChatError) throw cause
    throw new ChatError(MALFORMED_MESSAGE, { code: 'malformed', cause })
  }
}

const sessionEnded = () =>
  new ChatError(SESSION_ENDED_MESSAGE, {
    code: 'unauthenticated',
    retryable: false,
  })

/** Sends one chat request; the token goes only in the header, never in the URL or body. */
async function post(body: string, token: string): Promise<Response> {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
  try {
    return await fetch(ENDPOINT, { method: 'POST', headers, body })
  } catch (cause) {
    throw new ChatError(FAILED_MESSAGE, { code: 'network', cause })
  }
}
