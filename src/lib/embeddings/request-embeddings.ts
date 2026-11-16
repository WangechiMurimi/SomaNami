import { getAccessToken } from '../auth/access-token.ts'
import type { EmbedReply } from '../../types/contracts.ts'

const ENDPOINT = '/api/embed'

/** A failed `POST /api/embed`; `code` is the server's error code when it sent one. */
export class EmbedRequestError extends Error {
  readonly code: string
  readonly status?: number

  constructor(
    message: string,
    { code, status, cause }: { code: string; status?: number; cause?: unknown },
  ) {
    super(message, { cause })
    this.name = 'EmbedRequestError'
    this.code = code
    if (status !== undefined) this.status = status
  }
}

export interface RequestEmbeddingsOptions {
  /** Test seams. */
  fetch?: typeof globalThis.fetch
  getToken?: typeof getAccessToken
}

/**
 * Asks the server to embed one page of the learner's chunks that have no
 * vector yet. No chunk text is sent: the server reads it from Supabase as the
 * learner. Resolves to `{ embedded, done }`; call again until `done`.
 */
export async function requestEmbeddings({
  fetch = globalThis.fetch,
  getToken = getAccessToken,
}: RequestEmbeddingsOptions = {}): Promise<EmbedReply> {
  const token = await getToken()
  if (!token) throw unauthenticated()

  let response = await post(fetch, token)
  if (response.status === 401) {
    // The token may have expired between the client's auto-refresh and now;
    // one refresh, as chat does. A second 401 means the session is gone.
    const fresh = await getToken({ refresh: true })
    if (fresh) response = await post(fetch, fresh)
    if (!fresh || response.status === 401) throw unauthenticated()
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (cause) {
    if (!response.ok) throw httpFailure(response.status, cause)
    throw new EmbedRequestError('Unreadable embed reply', {
      code: 'malformed',
      cause,
    })
  }

  if (!response.ok) {
    const code = (payload as { error?: unknown } | null)?.error
    throw typeof code === 'string'
      ? new EmbedRequestError('Embedding failed', {
          code,
          status: response.status,
        })
      : httpFailure(response.status)
  }

  if (!isEmbedReply(payload)) {
    throw new EmbedRequestError('Unreadable embed reply', { code: 'malformed' })
  }
  return payload
}

function isEmbedReply(value: unknown): value is EmbedReply {
  if (value === null || typeof value !== 'object') return false
  const { embedded, done } = value as Partial<EmbedReply>
  return (
    typeof done === 'boolean' &&
    typeof embedded === 'number' &&
    Number.isInteger(embedded) &&
    embedded >= 0
  )
}

const unauthenticated = () =>
  new EmbedRequestError('No session', { code: 'unauthenticated' })

const httpFailure = (status: number, cause?: unknown) =>
  new EmbedRequestError('Embedding failed', {
    code: `http_${status}`,
    status,
    cause,
  })

/** The token goes only in the header, never in the URL or body. */
async function post(
  fetch: typeof globalThis.fetch,
  token: string,
): Promise<Response> {
  try {
    return await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: '{}',
    })
  } catch (cause) {
    throw new EmbedRequestError('Could not reach the server', {
      code: 'offline',
      cause,
    })
  }
}
