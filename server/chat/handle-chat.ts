import {
  clearIndexCache,
  retrieveChunks,
} from '../../src/lib/retrieval/index.ts'
import type {
  ChatReply,
  CitedPassage,
  Passage,
} from '../../src/types/contracts.ts'
import type { Authenticate } from '../auth/types.ts'
import { UpstreamError } from '../llm/answerer.ts'
import type { Answerer } from '../llm/answerer.ts'
import { parseChatRequest } from './chat-request.ts'
import type { LoadMaterials } from './load-materials.ts'

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
  /** Answers chat questions; `null` means no LLM provider is configured. */
  answer: Answerer | null
  /** Verifies the caller's session; see `server/auth/verify-access-token.ts`. */
  authenticate: Authenticate
  /**
   * Loads the requested materials as the caller (see `load-materials.ts`);
   * `null` means the server has no Supabase settings.
   */
  loadMaterials: LoadMaterials | null
  /** The raw `Authorization` header, passed through untouched. */
  authorization: string | undefined
}

const notAnswerable = (answer: string): ChatReply => ({
  answer,
  citations: [],
  answerable: false,
  passages: [],
})

/**
 * Handles one `POST /api/chat`: checks the session, validates the body, loads
 * the named materials as the caller, ranks their chunks, answers from the best
 * ones, and enforces grounding on the way out.
 */
export async function handleChat(
  body: unknown,
  { answer, authenticate, authorization, loadMaterials }: ChatDependencies,
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

  // No materials means nothing to ground an answer in; skip the database.
  if (request.materialIds.length === 0) {
    return { status: 200, body: notAnswerable(NO_PASSAGES_ANSWER) }
  }

  if (!loadMaterials) {
    return { status: 503, body: { error: 'not-configured' } }
  }

  // Loaded with the caller's own token, so RLS returns only their rows: ids
  // belonging to someone else, or to nothing, simply come back empty.
  let materials
  try {
    materials = await loadMaterials({
      userId: session.user.id,
      accessToken: session.accessToken,
      materialIds: request.materialIds,
    })
  } catch (error) {
    // Only the error's kind is logged: a database message can quote the ids
    // or values of the learner's own rows.
    console.error('Loading chat materials failed', describeFailure(error))
    return { status: 502, body: { error: 'materials-unavailable' } }
  }

  const passages: Passage[] = retrieveChunks(request.question, materials).map(
    ({ documentId, chunkId, text, source }) => ({
      documentId,
      chunkId,
      text,
      source,
    }),
  )
  // The index is cached for the browser's repeated questions; on the server it
  // would only keep this user's text in memory after the request ends.
  clearIndexCache()

  // Retrieval found nothing relevant: there is nothing to ground an answer in,
  // so say so without spending a model call that could only guess.
  if (passages.length === 0) {
    return { status: 200, body: notAnswerable(NO_PASSAGES_ANSWER) }
  }

  if (!answer) {
    return { status: 503, body: { error: 'not-configured' } }
  }

  let outcome
  try {
    outcome = await answer({
      question: request.question,
      passages,
      history: request.history,
    })
  } catch (error) {
    return upstreamFailure(error)
  }

  if (outcome.kind === 'refusal') {
    return { status: 200, body: notAnswerable(REFUSAL_ANSWER) }
  }

  // Never trust the model's citations blindly: keep only ids of passages it
  // was actually given, so a hallucinated id cannot appear as a source.
  const names = new Map(materials.map(({ id, name }) => [id, name]))
  const given = new Map(passages.map((passage) => [passage.chunkId, passage]))
  const cited = [...new Set(outcome.answer.citations)].flatMap(
    (id): CitedPassage[] => {
      const passage = given.get(id)
      if (!passage) return []
      return [{ ...passage, documentName: names.get(passage.documentId) ?? '' }]
    },
  )

  // An answer presented as grounded must point at a real passage. If none of
  // its citations survive, it is not document-supported, whatever it claims.
  const answerable = outcome.answer.answerable && cited.length > 0
  return {
    status: 200,
    body: {
      answer: outcome.answer.answer,
      citations: answerable
        ? cited.map(({ documentId, chunkId }) => ({ documentId, chunkId }))
        : [],
      answerable,
      passages: answerable ? cited : [],
    },
  }
}

function upstreamFailure(error: unknown): HandlerResponse {
  const kind = error instanceof UpstreamError ? error.kind : 'failed'
  switch (kind) {
    case 'rate-limited':
      return { status: 503, body: { error: 'rate-limited' } }
    case 'not-configured':
      // Our credentials are wrong or missing: a server problem, not the user's.
      console.error('LLM provider rejected the server credentials')
      return { status: 503, body: { error: 'not-configured' } }
    case 'unreachable':
      return { status: 502, body: { error: 'upstream-unreachable' } }
    case 'timeout':
      // The model did not answer before our deadline, which sits under the
      // serverless time limit so the client gets JSON rather than a cut-off.
      return { status: 504, body: { error: 'upstream-timeout' } }
    case 'failed':
      console.error('Chat answer failed', error)
      return { status: 502, body: { error: 'upstream-failed' } }
  }
}

/** A log-safe summary of a loader failure: its name and any database code. */
function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown'
  const cause: unknown = error.cause
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? ` (${String(cause.code)})`
      : ''
  return `${error.name}${code}`
}
