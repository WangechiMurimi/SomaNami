import { withApiHeaders } from '../../server/api-headers.ts'
import type { Authenticate } from '../../server/auth/types.ts'
import { createAuthenticatorFromEnv } from '../../server/auth/verify-access-token.ts'
import { handleChat } from '../../server/chat/handle-chat.ts'
import { CHAT_BODY_LIMIT_BYTES } from '../../server/chat/limits.ts'
import { createMaterialsLoaderFromEnv } from '../../server/chat/load-materials.ts'
import type { LoadMaterials } from '../../server/chat/load-materials.ts'
import { createAnswererFromEnv } from '../../server/llm/answerer-from-env.ts'
import type { Answerer } from '../../server/llm/claude-answerer.ts'
import { readJsonBody } from '../../server/read-capped.ts'

export interface ChatFunctionOptions {
  answer: Answerer | null
  /** Defaults to verifying against `SUPABASE_URL`; tests inject a fake. */
  authenticate?: Authenticate
  /** Defaults to loading as the user from the Supabase settings; tests inject a fake. */
  loadMaterials?: LoadMaterials | null
}

/** Builds the `POST /api/chat` handler around its dependencies. */
export function createChatFunction({
  answer,
  authenticate = createAuthenticatorFromEnv(),
  loadMaterials = createMaterialsLoaderFromEnv(),
}: ChatFunctionOptions) {
  return async (request: Request): Promise<Response> =>
    withApiHeaders(await respond(request))

  async function respond(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json(
        { error: 'method-not-allowed' },
        { status: 405, headers: { Allow: 'POST' } },
      )
    }

    const read = await readJsonBody(request, CHAT_BODY_LIMIT_BYTES)
    if (!read.ok) {
      const status = read.problem === 'too-large' ? 413 : 400
      return Response.json({ error: read.problem }, { status })
    }

    const result = await handleChat(read.body, {
      answer,
      authenticate,
      authorization: request.headers.get('authorization') ?? undefined,
      loadMaterials,
    })
    return Response.json(result.body, { status: result.status })
  }
}

// Built once per function instance and reused across invocations; the remote
// key set inside the authenticator caches Supabase's signing keys the same way.
export default createChatFunction({ answer: createAnswererFromEnv() })

export const config = {
  path: '/api/chat',
  // Netlify's per-IP limit (429 when exceeded). Netlify reads this object
  // statically at deploy, so it must stay literal; a test keeps it equal to
  // server/chat/limits.ts. Function rate limits can't go in netlify.toml.
  rateLimit: {
    windowLimit: 20,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
}
