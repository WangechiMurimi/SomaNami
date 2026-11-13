// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { Authenticate } from '../../server/auth/types.ts'
import type { Answerer } from '../../server/llm/claude-answerer.ts'
import chat, { config, createChatFunction, MAX_BODY_BYTES } from './chat.ts'

const allow = () =>
  vi.fn<Authenticate>().mockResolvedValue({
    ok: true,
    user: { id: 'user-1', aal: 'aal1' },
  })

/** Accepts only requests that carry some Authorization header. */
const requireHeader: Authenticate = async (header) =>
  header
    ? { ok: true, user: { id: 'user-1', aal: 'aal1' } }
    : { ok: false, reason: 'missing' }

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('https://example.test/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  })

/** A request whose body streams in without announcing a Content-Length. */
const streamed = (text: string) =>
  new Request('https://example.test/api/chat', {
    method: 'POST',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text))
        controller.close()
      },
    }),
    duplex: 'half',
  } as RequestInit)

describe('chat function', () => {
  it('is routed at /api/chat', () => {
    expect(config.path).toBe('/api/chat')
  })

  it('rate-limits each client IP', () => {
    expect(config.rateLimit).toEqual({
      windowLimit: 20,
      windowSize: 60,
      aggregateBy: ['ip', 'domain'],
    })
  })

  it('rejects methods other than POST', async () => {
    const response = await chat(new Request('https://example.test/api/chat'))

    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('POST')
  })

  it('answers malformed JSON with a JSON 400', async () => {
    const handler = createChatFunction({ answer: null, authenticate: allow() })

    const response = await handler(post('{"question":'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid-json' })
  })

  it('delegates a valid body to the shared handler', async () => {
    const handler = createChatFunction({ answer: null, authenticate: allow() })

    // No passages, so the handler answers without needing an API key.
    const response = await handler(
      post(JSON.stringify({ question: 'Why ATP?' })),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ answerable: false })
  })

  describe('authentication', () => {
    it('passes the Authorization header to the authenticator', async () => {
      const authenticate = allow()
      const handler = createChatFunction({ answer: null, authenticate })

      await handler(
        post(JSON.stringify({ question: 'Why ATP?' }), {
          Authorization: 'Bearer abc.def.ghi',
        }),
      )

      expect(authenticate).toHaveBeenCalledWith('Bearer abc.def.ghi')
    })

    it('answers 401 without a token, before any model call', async () => {
      const answer = vi.fn<Answerer>()
      const handler = createChatFunction({
        answer,
        authenticate: requireHeader,
      })

      const response = await handler(
        post(JSON.stringify({ question: 'Why ATP?' })),
      )

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'unauthenticated' })
      expect(answer).not.toHaveBeenCalled()
    })

    it('fails closed when sessions cannot be verified', async () => {
      vi.stubEnv('SUPABASE_URL', '')
      try {
        const handler = createChatFunction({ answer: null })

        const response = await handler(
          post(JSON.stringify({ question: 'Why ATP?' }), {
            Authorization: 'Bearer looks-real',
          }),
        )

        expect(response.status).toBe(503)
        expect(await response.json()).toEqual({ error: 'not-configured' })
      } finally {
        vi.unstubAllEnvs()
      }
    })
  })

  describe('body size', () => {
    it('rejects a declared Content-Length over 1 MB without reading it', async () => {
      const authenticate = allow()
      const handler = createChatFunction({ answer: null, authenticate })
      const request = post('{}', {
        'Content-Length': String(MAX_BODY_BYTES + 1),
      })

      const response = await handler(request)

      expect(response.status).toBe(413)
      expect(await response.json()).toEqual({ error: 'too-large' })
      expect(request.bodyUsed).toBe(false)
      expect(authenticate).not.toHaveBeenCalled()
    })

    it('rejects a body over 1 MB that did not declare its length', async () => {
      const handler = createChatFunction({
        answer: null,
        authenticate: allow(),
      })

      const response = await handler(streamed('x'.repeat(MAX_BODY_BYTES + 1)))

      expect(response.status).toBe(413)
      expect(await response.json()).toEqual({ error: 'too-large' })
    })

    it('counts bytes, not characters', async () => {
      const handler = createChatFunction({
        answer: null,
        authenticate: allow(),
      })
      // Each "é" is two bytes in UTF-8, so this is over the limit in bytes
      // while staying under it in characters.
      const text = JSON.stringify({ question: 'é'.repeat(MAX_BODY_BYTES / 2) })

      const response = await handler(streamed(text))

      expect(response.status).toBe(413)
    })

    it('accepts a body just under the limit', async () => {
      const handler = createChatFunction({
        answer: null,
        authenticate: allow(),
      })
      const filler = 'x'.repeat(MAX_BODY_BYTES - 100)

      const response = await handler(
        streamed(JSON.stringify({ question: 'Why?', filler })),
      )

      expect(response.status).not.toBe(413)
    })
  })
})
