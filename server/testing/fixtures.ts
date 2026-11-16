import { vi } from 'vitest'
import type { AuthOutcome, Authenticate } from '../auth/types.ts'
import type { FetchedLink } from '../link/fetch-link.ts'

/** What authenticating user-1, at the basic assurance level, returns. */
export function signedInUser(accessToken = 'token-of-user-1'): AuthOutcome {
  return { ok: true, user: { id: 'user-1', aal: 'aal1' }, accessToken }
}

/** An authenticator that lets every request in as user-1. */
export const allowUser = (accessToken?: string) =>
  vi.fn<Authenticate>().mockResolvedValue(signedInUser(accessToken))

/** A fetched PDF: its magic bytes plus a zero and a non-ASCII byte. */
export const PDF_LINK: FetchedLink = {
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x0a]),
  contentType: 'application/pdf',
  finalUrl: 'https://example.com/papers/cells.pdf',
  fileName: 'Cell biology.pdf',
}

/**
 * Request builders for one endpoint: a JSON POST, and a POST whose body
 * streams in without announcing a Content-Length.
 */
export function requestsTo(url: string) {
  const post = (body: string, headers: Record<string, string> = {}) =>
    new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
    })

  const streamed = (text: string) =>
    new Request(url, {
      method: 'POST',
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text))
          controller.close()
        },
      }),
      duplex: 'half',
    } as RequestInit)

  return { post, streamed }
}
