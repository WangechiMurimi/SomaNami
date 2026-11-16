import { z } from 'zod'
import type { EmbedReply } from '../../src/types/contracts.ts'
import type { Authenticate } from '../auth/types.ts'
import { EmbedderError } from '../llm/ollama-embedder.ts'
import type { Embedder } from '../llm/ollama-embedder.ts'
import type { ChunkStoreFor } from './chunk-store.ts'
import { EMBED_CHUNKS_PER_REQUEST, EMBED_MAX_TEXT_CHARS } from './limits.ts'

/** Error codes of `POST /api/embed`. */
export type EmbedErrorCode =
  | 'invalid-json'
  | 'invalid-request'
  | 'unauthenticated'
  | 'not-configured'
  | 'rate-limited'
  | 'materials-unavailable'
  | 'upstream-unreachable'
  | 'upstream-failed'

/** A transport-neutral response, so Express and Netlify share one handler. */
export interface EmbedResponse {
  status: number
  body: EmbedReply | { error: EmbedErrorCode; issues?: string[] }
}

export interface EmbedDependencies {
  /** Verifies the caller's session; see `server/auth/verify-access-token.ts`. */
  authenticate: Authenticate
  /** The raw `Authorization` header, passed through untouched. */
  authorization: string | undefined
  /** Embeds texts with our own Ollama; `null` means it isn't configured. */
  embed: Embedder | null
  /** Opens the caller's chunks; `null` means Supabase isn't configured. */
  chunks: ChunkStoreFor | null
}

// The server decides what to embed, so the body carries nothing yet. Unknown
// properties are ignored, like the other routes, so it can grow compatibly.
const embedRequest = z.object({})

const failure = (
  status: number,
  error: EmbedErrorCode,
  issues?: string[],
): EmbedResponse => ({
  status,
  body: issues ? { error, issues } : { error },
})

/**
 * Handles one `POST /api/embed`: checks the session, reads up to a page of the
 * caller's chunks that have no embedding (as the caller, so RLS applies),
 * embeds them with our Ollama and writes the vectors back the same way.
 */
export async function handleEmbed(
  body: unknown,
  { authenticate, authorization, embed, chunks }: EmbedDependencies,
): Promise<EmbedResponse> {
  // Authenticate first, so anonymous traffic never reaches the model or the
  // database. The header is a live credential and is never logged.
  const session = await authenticate(authorization)
  if (!session.ok) {
    return session.reason === 'not-configured'
      ? failure(503, 'not-configured')
      : failure(401, 'unauthenticated')
  }

  const parsed = embedRequest.safeParse(body)
  if (!parsed.success) {
    return failure(
      400,
      'invalid-request',
      parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`,
      ),
    )
  }

  if (!embed || !chunks) return failure(503, 'not-configured')

  const store = chunks({
    userId: session.user.id,
    accessToken: session.accessToken,
  })

  let pending
  try {
    // One extra row tells "this was the last page" from "more remain".
    pending = await store.pending(EMBED_CHUNKS_PER_REQUEST + 1)
  } catch (error) {
    // Only the error's kind: a database message can quote the learner's rows.
    console.error('Loading chunks to embed failed', describe(error))
    return failure(502, 'materials-unavailable')
  }
  const page = pending.slice(0, EMBED_CHUNKS_PER_REQUEST)
  if (page.length === 0) {
    return { status: 200, body: { embedded: 0, done: true } }
  }

  let vectors
  try {
    vectors = await embed(
      page.map(({ text }) => text.slice(0, EMBED_MAX_TEXT_CHARS)),
    )
  } catch (error) {
    return embedFailure(error)
  }

  try {
    await store.save(
      page.map(({ id }, index) => ({ id, embedding: vectors[index]! })),
    )
  } catch (error) {
    console.error('Saving embeddings failed', describe(error))
    return failure(502, 'materials-unavailable')
  }

  return {
    status: 200,
    body: {
      embedded: page.length,
      done: pending.length <= EMBED_CHUNKS_PER_REQUEST,
    },
  }
}

function embedFailure(error: unknown): EmbedResponse {
  if (!(error instanceof EmbedderError)) {
    // An unknown error may carry the request, so only its class is logged.
    console.error('Embedding failed', describe(error))
    return failure(502, 'upstream-failed')
  }
  // EmbedderError messages hold only the kind and status, never the text.
  console.error(error.message)
  switch (error.kind) {
    case 'unauthorized':
      // Our gateway key is wrong or missing: a server problem.
      return failure(503, 'not-configured')
    case 'rate-limited':
      return failure(503, 'rate-limited')
    case 'unreachable':
    case 'timeout':
      return failure(502, 'upstream-unreachable')
    default:
      return failure(502, 'upstream-failed')
  }
}

/** A log-safe summary of a failure: its name and any database code. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown'
  const cause: unknown = error.cause
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? ` (${String(cause.code)})`
      : ''
  return `${error.name}${code}`
}
