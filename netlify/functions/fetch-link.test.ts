// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { Authenticate } from '../../server/auth/types.ts'
import type { FetchedLink } from '../../server/link/fetch-link.ts'
import type { FetchLinkDependencies } from '../../server/link/handle-fetch-link.ts'
import {
  LINK_BODY_LIMIT_BYTES,
  LINK_RATE_LIMIT,
  LINK_RATE_WINDOW_SECONDS,
} from '../../server/link/limits.ts'
import fetchLinkFunction, {
  config,
  createFetchLinkFunction,
} from './fetch-link.ts'

const allow = () =>
  vi.fn<Authenticate>().mockResolvedValue({
    ok: true,
    user: { id: 'user-1', aal: 'aal1' },
    accessToken: 'token-of-user-1',
  })

const deny: Authenticate = async () => ({ ok: false, reason: 'missing' })

const pdf: FetchedLink = {
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]),
  contentType: 'application/pdf',
  finalUrl: 'https://example.com/papers/cells.pdf',
  fileName: 'Cell biology.pdf',
}

const fetched = () =>
  vi
    .fn<FetchLinkDependencies['fetch']>()
    .mockResolvedValue({ ok: true, link: pdf })

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('https://example.test/api/fetch-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  })

/** A request whose body streams in without announcing a Content-Length. */
const streamed = (text: string) =>
  new Request('https://example.test/api/fetch-link', {
    method: 'POST',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text))
        controller.close()
      },
    }),
    duplex: 'half',
  } as RequestInit)

const validBody = JSON.stringify({
  url: 'https://example.com/papers/cells.pdf',
})

describe('fetch-link function', () => {
  it('is routed at /api/fetch-link', () => {
    expect(config.path).toBe('/api/fetch-link')
  })

  it('rate-limits each client IP like the dev server', () => {
    expect(config.rateLimit).toEqual({
      windowLimit: LINK_RATE_LIMIT,
      windowSize: LINK_RATE_WINDOW_SECONDS,
      aggregateBy: ['ip', 'domain'],
    })
  })

  it('rejects methods other than POST', async () => {
    const response = await fetchLinkFunction(
      new Request('https://example.test/api/fetch-link'),
    )

    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('POST')
  })

  it('returns the fetched bytes as a binary response', async () => {
    const fetch = fetched()
    const handler = createFetchLinkFunction({ authenticate: allow(), fetch })

    const response = await handler(post(validBody))

    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf.bytes)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('X-Final-Url')).toBe(pdf.finalUrl)
    expect(response.headers.get('Content-Disposition')).toBe(
      "attachment; filename*=UTF-8''Cell%20biology.pdf",
    )
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(fetch).toHaveBeenCalledWith('https://example.com/papers/cells.pdf')
  })

  it('reports fetch failures as JSON with their status', async () => {
    const handler = createFetchLinkFunction({
      authenticate: allow(),
      fetch: vi
        .fn<FetchLinkDependencies['fetch']>()
        .mockResolvedValue({ ok: false, code: 'blocked-address' }),
    })

    const response = await handler(post(validBody))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'blocked-address' })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('answers malformed JSON with a JSON 400', async () => {
    const handler = createFetchLinkFunction({ authenticate: allow() })

    const response = await handler(post('{"url":'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid-url' })
  })

  it('answers an invalid body with a JSON 400', async () => {
    const fetch = fetched()
    const handler = createFetchLinkFunction({ authenticate: allow(), fetch })

    const response = await handler(post(JSON.stringify({ url: '' })))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid-url' })
    expect(fetch).not.toHaveBeenCalled()
  })

  describe('authentication', () => {
    it('passes the Authorization header to the authenticator', async () => {
      const authenticate = allow()
      const handler = createFetchLinkFunction({
        authenticate,
        fetch: fetched(),
      })

      await handler(post(validBody, { Authorization: 'Bearer abc.def.ghi' }))

      expect(authenticate).toHaveBeenCalledWith('Bearer abc.def.ghi')
    })

    it('answers 401 without a session, before any fetch', async () => {
      const fetch = fetched()
      const handler = createFetchLinkFunction({ authenticate: deny, fetch })

      const response = await handler(post(validBody))

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'unauthorized' })
      expect(fetch).not.toHaveBeenCalled()
    })

    it('fails closed when sessions cannot be verified', async () => {
      // Blank both: the server falls back to the browser's project URL, and
      // a developer's real .env would otherwise supply it.
      vi.stubEnv('SUPABASE_URL', '')
      vi.stubEnv('VITE_SUPABASE_URL', '')
      try {
        const fetch = fetched()
        const handler = createFetchLinkFunction({ fetch })

        const response = await handler(
          post(validBody, { Authorization: 'Bearer looks-real' }),
        )

        expect(response.status).toBe(503)
        expect(await response.json()).toEqual({ error: 'not-configured' })
        expect(fetch).not.toHaveBeenCalled()
      } finally {
        vi.unstubAllEnvs()
      }
    })
  })

  describe('body size', () => {
    it('rejects a declared Content-Length over the limit without reading it', async () => {
      const authenticate = allow()
      const handler = createFetchLinkFunction({ authenticate })
      const request = post('{}', {
        'Content-Length': String(LINK_BODY_LIMIT_BYTES + 1),
      })

      const response = await handler(request)

      expect(response.status).toBe(413)
      expect(await response.json()).toEqual({ error: 'invalid-url' })
      expect(request.bodyUsed).toBe(false)
      expect(authenticate).not.toHaveBeenCalled()
    })

    it('rejects a body over the limit that did not declare its length', async () => {
      const handler = createFetchLinkFunction({ authenticate: allow() })

      const response = await handler(
        streamed(JSON.stringify({ url: 'x'.repeat(LINK_BODY_LIMIT_BYTES) })),
      )

      expect(response.status).toBe(413)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    })
  })
})
