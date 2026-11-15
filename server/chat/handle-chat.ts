import Anthropic from '@anthropic-ai/sdk'
import type { ChatReply, ChunkRef } from '../../src/types/contracts.ts'
import type { Authenticate } from '../auth/types.ts'
import type { Answerer } from '../llm/claude-answerer.ts'
import { parseChatRequest } from './chat-request.ts'

/** A transport-neutral response, so Express and Netlify share one handler. */
export interface HandlerResponse {
  status: number
  body: ChatReply | { error: string; issues?: string[] }
}

export const NO_PASSAGES_ANSWER =
  'Your documents don’t seem to cover this. Try rephrasing the question, or upload material that does.'

export const REFUSAL_ANSWER =
  'I can’t help with that request. Try asking about the content of your documents.'

export interface ChatDependencies {
  /** Answers chat questions; `null` means the server has no Claude credentials. */
  answer: Answerer | null
  /** Verifies the caller's session; see `server/auth/verify-access-token.ts`. */
  authenticate: Authenticate
  /** The raw `Authorization` header, passed through untouched. */
  authorization: string | undefined
}

const notAnswerable = (answer: string): ChatReply => ({
  answer,
  citations: [],
  answerable: false,
})

/**
 * Handles one `POST /api/chat`: checks the session, validates the body, answers
 * from the passages the client retrieved, and enforces grounding on the way out.
 */
export async function handleChat(
  body: unknown,
  { answer, authenticate, authorization }: ChatDependencies,
): Promise<HandlerResponse> {
  // Authenticate before validation, so anonymous traffic never reaches the
  // model. (The transport has already parsed the body; its 1 MB cap and rate
  // limit bound that cost.) The header is never logged: it is a live credential.
  const session = await authenticate(authorization)
  if (!session.ok) {
    return session.reason === 'not-configured'
      ? { status: 503, body: { error: 'not-configured' } }
      : { status: 401, body: { error: 'unauthenticated' } }
  }

  const parsed = parseChatRequest(body)
  if (!parsed.ok) {
    return {
      status: 400,
      body: { error: 'invalid-request', issues: parsed.issues },
    }
  }
  const { request } = parsed

  // Retrieval found nothing relevant: there is nothing to ground an answer in,
  // so say so without spending a model call that could only guess.
  if (request.passages.length === 0) {
    return { status: 200, body: notAnswerable(NO_PASSAGES_ANSWER) }
  }

  if (!answer) {
    return { status: 503, body: { error: 'not-configured' } }
  }

  let outcome
  try {
    outcome = await answer(request)
  } catch (error) {
    return upstreamFailure(error)
  }

  if (outcome.kind === 'refusal') {
    return { status: 200, body: notAnswerable(REFUSAL_ANSWER) }
  }

  // Never trust the model's citations blindly: keep only ids that were
  // actually sent, so a hallucinated id cannot appear as a source.
  const sent = new Map<string, ChunkRef>(
    request.passages.map(({ documentId, chunkId }) => [
      chunkId,
      { documentId, chunkId },
    ]),
  )
  const citations = [...new Set(outcome.answer.citations)].flatMap((id) => {
    const ref = sent.get(id)
    return ref ? [ref] : []
  })

  // An answer presented as grounded must point at a real passage. If none of
  // its citations survive, it is not document-supported, whatever it claims.
  const answerable = outcome.answer.answerable && citations.length > 0
  return {
    status: 200,
    body: {
      answer: outcome.answer.answer,
      citations: answerable ? citations : [],
      answerable,
    },
  }
}

function upstreamFailure(error: unknown): HandlerResponse {
  if (error instanceof Anthropic.RateLimitError) {
    return { status: 503, body: { error: 'rate-limited' } }
  }
  if (error instanceof Anthropic.AuthenticationError) {
    // Our key is wrong or missing: a server problem, not the user's.
    console.error('Claude API rejected the server credentials')
    return { status: 503, body: { error: 'not-configured' } }
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { status: 502, body: { error: 'upstream-unreachable' } }
  }
  console.error('Chat answer failed', error)
  return { status: 502, body: { error: 'upstream-failed' } }
}
