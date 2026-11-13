import type { Authenticate } from '../../server/auth/types.ts'
import { createAuthenticatorFromEnv } from '../../server/auth/verify-access-token.ts'
import { handleChat } from '../../server/chat/handle-chat.ts'
import { createAnswererFromEnv } from '../../server/llm/answerer-from-env.ts'
import type { Answerer } from '../../server/llm/claude-answerer.ts'

/** Matches Express's `express.json({ limit: '1mb' })`, so both servers agree. */
export const MAX_BODY_BYTES = 1024 * 1024

export interface ChatFunctionOptions {
  answer: Answerer | null
  /** Defaults to verifying against `SUPABASE_URL`; tests inject a fake. */
  authenticate?: Authenticate
}

const tooLarge = () => Response.json({ error: 'too-large' }, { status: 413 })

/** Builds the `POST /api/chat` handler around its dependencies. */
export function createChatFunction({
  answer,
  authenticate = createAuthenticatorFromEnv(),
}: ChatFunctionOptions) {
  return async function chat(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json(
        { error: 'method-not-allowed' },
        { status: 405, headers: { Allow: 'POST' } },
      )
    }

    // A declared length is free to check; the read below still enforces the
    // cap for bodies that lie about it or stream without one.
    const declared = Number(request.headers.get('content-length'))
    if (declared > MAX_BODY_BYTES) return tooLarge()

    const text = await readCapped(request, MAX_BODY_BYTES)
    if (text === null) return tooLarge()

    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return Response.json({ error: 'invalid-json' }, { status: 400 })
    }

    const result = await handleChat(body, {
      answer,
      authenticate,
      authorization: request.headers.get('authorization') ?? undefined,
    })
    return Response.json(result.body, { status: result.status })
  }
}

/** Reads the body as UTF-8, or `null` as soon as it passes `limit` bytes. */
async function readCapped(
  request: Request,
  limit: number,
): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > limit) {
      // Stop pulling the rest of an oversized upload.
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

// Built once per function instance and reused across invocations; the remote
// key set inside the authenticator caches Supabase's signing keys the same way.
export default createChatFunction({ answer: createAnswererFromEnv() })

export const config = {
  path: '/api/chat',
  // Netlify's per-IP limit (429 when exceeded), matching the Express dev
  // server. Function rate limits can only be set here, not in netlify.toml.
  rateLimit: {
    windowLimit: 20,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
}
