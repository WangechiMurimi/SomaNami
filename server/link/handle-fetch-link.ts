import { z } from 'zod'
import type {
  FetchLinkErrorCode,
  FetchLinkFailure,
} from '../../src/types/contracts.ts'
import type { Authenticate } from '../auth/types.ts'
import type { FetchLinkOutcome } from './fetch-link.ts'
import { LINK_MAX_URL_CHARS } from './limits.ts'

/** A transport-neutral result, so Express and Netlify share one handler. */
export type FetchLinkResponse =
  | {
      status: 200
      bytes: Uint8Array
      contentType: string
      finalUrl: string
      fileName: string
    }
  | { status: number; body: FetchLinkFailure }

export interface FetchLinkDependencies {
  /** Verifies the caller's session; see `server/auth/verify-access-token.ts`. */
  authenticate: Authenticate
  /** The raw `Authorization` header, passed through untouched. */
  authorization: string | undefined
  /** Fetches the link; `fetchLink` in production, a fake in tests. */
  fetch: (url: string) => Promise<FetchLinkOutcome>
}

/** HTTP status for each failure, so the client can branch on either. */
export const FETCH_LINK_STATUS: Readonly<Record<FetchLinkErrorCode, number>> = {
  'invalid-url': 400,
  'video-not-supported': 400,
  'blocked-address': 400,
  'unsupported-type': 415,
  'too-large': 413,
  timeout: 504,
  unreachable: 502,
  'too-many-redirects': 502,
  'login-or-paywall': 502,
  'rate-limited': 429,
  unauthorized: 401,
  'not-configured': 503,
}

// The URL itself is checked by `validateUrl`; this only bounds the input.
const fetchLinkRequest = z.object({
  url: z.string().trim().min(1).max(LINK_MAX_URL_CHARS),
})

const failure = (error: FetchLinkErrorCode): FetchLinkResponse => ({
  status: FETCH_LINK_STATUS[error],
  body: { error },
})

/**
 * Handles one `POST /api/fetch-link`: checks the session, validates the body
 * and fetches the link. URLs and fetched bytes are never logged; they reveal
 * what a learner studies, so they get the same care as their documents.
 */
export async function handleFetchLink(
  body: unknown,
  { authenticate, authorization, fetch }: FetchLinkDependencies,
): Promise<FetchLinkResponse> {
  // Authenticate first, so anonymous callers can't use us as an open proxy.
  // The header is never logged: it is a live credential.
  const session = await authenticate(authorization)
  if (!session.ok) {
    return failure(
      session.reason === 'not-configured' ? 'not-configured' : 'unauthorized',
    )
  }

  const parsed = fetchLinkRequest.safeParse(body)
  if (!parsed.success) return failure('invalid-url')

  let outcome: FetchLinkOutcome
  try {
    outcome = await fetch(parsed.data.url)
  } catch (error) {
    // Only the class name: the error may carry the URL in its message.
    console.error('Link fetch failed unexpectedly', (error as Error)?.name)
    return failure('unreachable')
  }
  if (!outcome.ok) return failure(outcome.code)

  return { status: 200, ...outcome.link }
}
