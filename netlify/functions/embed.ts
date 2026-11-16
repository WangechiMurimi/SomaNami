import { withApiHeaders } from '../../server/api-headers.ts'
import type { Authenticate } from '../../server/auth/types.ts'
import { createAuthenticatorFromEnv } from '../../server/auth/verify-access-token.ts'
import { createChunkStoreFromEnv } from '../../server/embed/chunk-store.ts'
import type { ChunkStoreFor } from '../../server/embed/chunk-store.ts'
import { handleEmbed } from '../../server/embed/handle-embed.ts'
import { EMBED_BODY_LIMIT_BYTES } from '../../server/embed/limits.ts'
import { createEmbedderFromEnv } from '../../server/llm/ollama-embedder.ts'
import type { Embedder } from '../../server/llm/ollama-embedder.ts'
import { readCapped } from '../../server/read-capped.ts'

export interface EmbedFunctionOptions {
  /** Defaults to verifying against `SUPABASE_URL`; tests inject a fake. */
  authenticate?: Authenticate
  /** Defaults to the learner's chunks from the Supabase settings; tests inject a fake. */
  chunks?: ChunkStoreFor | null
  /** Defaults to Ollama from `OLLAMA_BASE_URL`; tests inject a fake. */
  embed?: Embedder | null
}

const tooLarge = () => Response.json({ error: 'too-large' }, { status: 413 })

/** Builds the `POST /api/embed` handler around its dependencies. */
export function createEmbedFunction({
  authenticate = createAuthenticatorFromEnv(),
  chunks = createChunkStoreFromEnv(),
  embed = createEmbedderFromEnv(),
}: EmbedFunctionOptions = {}) {
  return async (request: Request): Promise<Response> =>
    withApiHeaders(await respond(request))

  async function respond(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json(
        { error: 'method-not-allowed' },
        { status: 405, headers: { Allow: 'POST' } },
      )
    }

    // A declared length is free to check; the read below still enforces the
    // cap for bodies that lie about it or stream without one.
    const declared = Number(request.headers.get('content-length'))
    if (declared > EMBED_BODY_LIMIT_BYTES) return tooLarge()

    const text = await readCapped(request, EMBED_BODY_LIMIT_BYTES)
    if (text === null) return tooLarge()

    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return Response.json({ error: 'invalid-json' }, { status: 400 })
    }

    const result = await handleEmbed(body, {
      authenticate,
      authorization: request.headers.get('authorization') ?? undefined,
      chunks,
      embed,
    })
    return Response.json(result.body, { status: result.status })
  }
}

// Built once per function instance and reused across invocations.
export default createEmbedFunction()

export const config = {
  path: '/api/embed',
  // Netlify's per-IP limit (429 when exceeded). Netlify reads this object
  // statically at deploy, so it must stay literal; a test keeps it equal to
  // server/embed/limits.ts.
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
}
