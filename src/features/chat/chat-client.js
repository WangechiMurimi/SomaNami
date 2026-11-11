const ENDPOINT = '/api/chat'

const OFFLINE_MESSAGE =
  'We couldn’t reach the answer service. Check your connection and try again.'
const SERVER_MESSAGE =
  'The answer service had a problem answering that question.'
const MALFORMED_MESSAGE = 'The answer service sent something we couldn’t read.'

/** A chat failure the UI can present; `retryable` drives the retry affordance. */
export class ChatError extends Error {
  constructor(message, { code = 'unknown', retryable = true, cause } = {}) {
    super(message, { cause })
    this.name = 'ChatError'
    this.code = code
    this.retryable = retryable
  }
}

/** Rejects replies that break the ADR 0001 shape so the UI never renders half an answer. */
function assertReply(payload) {
  const valid =
    payload !== null &&
    typeof payload === 'object' &&
    typeof payload.answer === 'string' &&
    typeof payload.answerable === 'boolean' &&
    Array.isArray(payload.citations)
  if (!valid) {
    throw new ChatError(MALFORMED_MESSAGE, {
      code: 'malformed',
      retryable: false,
    })
  }
  return payload
}

/**
 * Asks `POST /api/chat` one grounded question (ADR 0001) and returns
 * `{ answer, citations, answerable }`.
 */
export async function askQuestion({ question, passages = [], history = [] }) {
  let response
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
