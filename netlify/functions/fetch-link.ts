import { withApiHeaders } from '../../server/api-headers.ts'
import type { Authenticate } from '../../server/auth/types.ts'
import { createAuthenticatorFromEnv } from '../../server/auth/verify-access-token.ts'
import { fetchLink } from '../../server/link/fetch-link.ts'
import {
  handleFetchLink,
  type FetchLinkDependencies,
} from '../../server/link/handle-fetch-link.ts'
import { LINK_BODY_LIMIT_BYTES } from '../../server/link/limits.ts'
import { linkResponseHeaders } from '../../server/link/link-headers.ts'
import { readCapped } from '../../server/read-capped.ts'
import type { FetchLinkFailure } from '../../src/types/contracts.ts'

export interface FetchLinkFunctionOptions {
  /** Defaults to verifying against `SUPABASE_URL`; tests inject a fake. */
  authenticate?: Authenticate
  /** Defaults to the SSRF-safe fetcher; tests inject a fake. */
  fetch?: FetchLinkDependencies['fetch']
}

// The client only ever sends `{ url }`, so a body we can't read means the URL
// couldn't be used; keeping the code in FetchLinkErrorCode lets the UI show
// its usual message.
const unreadable = (status: number) =>
  Response.json({ error: 'invalid-url' } satisfies FetchLinkFailure, {
    status,
  })

/** Builds the `POST /api/fetch-link` handler around its dependencies. */
export function createFetchLinkFunction({
  authenticate = createAuthenticatorFromEnv(),
  fetch = fetchLink,
}: FetchLinkFunctionOptions = {}) {
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
    if (declared > LINK_BODY_LIMIT_BYTES) return unreadable(413)

    const text = await readCapped(request, LINK_BODY_LIMIT_BYTES)
    if (text === null) return unreadable(413)

    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return unreadable(400)
    }

    const result = await handleFetchLink(body, {
      authenticate,
      authorization: request.headers.get('authorization') ?? undefined,
      fetch,
    })
    if (!('bytes' in result)) {
      return Response.json(result.body, { status: result.status })
    }
    return new Response(result.bytes, {
      status: 200,
      headers: linkResponseHeaders(result),
    })
  }
}

// Built once per function instance and reused across invocations, like chat.
export default createFetchLinkFunction()

export const config = {
  path: '/api/fetch-link',
  // Netlify's per-IP limit (429 when exceeded). Netlify reads this object
  // statically at deploy, so it must stay literal; a test keeps it equal to
  // server/link/limits.ts. Function rate limits can't go in netlify.toml.
  rateLimit: {
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
}
