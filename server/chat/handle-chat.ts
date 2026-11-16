import {
  clearIndexCache,
  retrieveChunks,
} from '../../src/lib/retrieval/index.ts'
import type {
  ChatReply,
  CitedPassage,
  ModelWakingReply,
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
  body: ChatReply | ModelWakingReply | { error: string; issues?: string[] }
  /** Extra response headers, applied by each transport. */
  headers?: Record<string, string>
}

export const NO_PASSAGES_ANSWER =
  'Your documents don’t seem to cover this. Try rephrasing the question, or upload material that does.'

/**
 * The retrieval-score gate: the best passage must reach this relevance (the
 * 0-1 ratio `retrieveChunks` returns) before a model is asked anything.
 *
 * WHY 0.2, above retrieval's own 0.12 floor: that floor decides which passages
 * are worth showing the model, and is kept low so the one relevant passage is
 * never dropped (#25). This gate decides whether the question is covered at
 * all, and guards against a small self-hosted model (#149) stitching an answer
 * together from passages that each share only a word with the question.
 * Retrieval's notes put accidental overlaps at 0.05-0.10 and passages that
 * really cover a question above 0.3; 0.2 is the middle of that gap. Weaker
 * passages still travel with a best passage that clears it. The ratio ignores
 * question terms the materials never contain, so a question about a subject
 * that is absent can still score high on one shared word; the citation check
 * below is the backstop for that case.
 */
export const MIN_ANSWER_SCORE = 0.2

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

  const hits = retrieveChunks(request.question, materials)
  // The index is cached for the browser's repeated questions; on the server it
  // would only keep this user's text in memory after the request ends.
  clearIndexCache()

  // Retrieval found nothing relevant enough (hits come best first): there is
  // nothing to ground an answer in, so say so without spending a model call
  // that could only guess.
  if ((hits[0]?.score ?? 0) < MIN_ANSWER_SCORE) {
    return { status: 200, body: notAnswerable(NO_PASSAGES_ANSWER) }
  }
  const passages: Passage[] = hits.map(
    ({ documentId, chunkId, text, source }) => ({
      documentId,
      chunkId,
      text,
      source,
    }),
  )

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

  // The model's VM is starting (#201). 503 with Retry-After is the standard
  // "come back shortly"; the typed body lets the client wait and resend the
  // question rather than show a failure.
  if (outcome.kind === 'model-waking') {
    const { retryAfterSeconds } = outcome
    return {
      status: 503,
      headers: { 'Retry-After': String(retryAfterSeconds) },
      body: { error: 'model-waking', retryAfterSeconds },
    }
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
  // its citations survive, it is not document-supported, whatever it claims,
  // and its text is not shown either: it may come from the model's general
  // knowledge rather than the learner's materials (#149).
  if (outcome.answer.answerable && cited.length === 0) {
    return { status: 200, body: notAnswerable(NO_PASSAGES_ANSWER) }
  }
  const { answerable } = outcome.answer
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
