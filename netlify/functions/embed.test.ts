// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { Authenticate } from '../../server/auth/types.ts'
import type {
  ChunkStore,
  ChunkStoreFor,
} from '../../server/embed/chunk-store.ts'
import {
  EMBED_BODY_LIMIT_BYTES,
  EMBED_RATE_LIMIT,
  EMBED_RATE_WINDOW_SECONDS,
} from '../../server/embed/limits.ts'
import type { Embedder } from '../../server/llm/ollama-embedder.ts'
import embedFunction, { config, createEmbedFunction } from './embed.ts'

const allow = () =>
  vi.fn<Authenticate>().mockResolvedValue({
    ok: true,
    user: { id: 'user-1', aal: 'aal1' },
    accessToken: 'token-1',
  })

const deny: Authenticate = async () => ({ ok: false, reason: 'missing' })

const chunkStore = () => {
  const store = {
    pending: vi
      .fn<ChunkStore['pending']>()
      .mockResolvedValue([{ id: 'doc-1:0', text: 'Cells divide.' }]),
    save: vi.fn<ChunkStore['save']>().mockResolvedValue(undefined),
  }
  return { store, chunks: vi.fn<ChunkStoreFor>(() => store) }
}

const embed = () => vi.fn<Embedder>(async (texts) => texts.map(() => [0.5]))

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('https://example.test/api/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  })

/** A request whose body streams in without announcing a Content-Length. */
const streamed = (text: string) =>
  new Request('https://example.test/api/embed', {
    method: 'POST',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text))
        controller.close()
      },
    }),
    duplex: 'half',
  } as RequestInit)

describe('embed function', () => {
  it('is routed at /api/embed', () => {
    expect(config.path).toBe('/api/embed')
  })

  it('rate-limits each client IP like the dev server', () => {
    expect(config.rateLimit).toEqual({
      windowLimit: EMBED_RATE_LIMIT,
      windowSize: EMBED_RATE_WINDOW_SECONDS,
      aggregateBy: ['ip', 'domain'],
    })
  })

  it('rejects methods other than POST', async () => {
    const response = await embedFunction(
      new Request('https://example.test/api/embed'),
    )

    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('POST')
  })

  it('embeds the caller’s pending chunks through the shared handler', async () => {
    const { store, chunks } = chunkStore()
    const authenticate = allow()
    const handler = createEmbedFunction({
      authenticate,
      chunks,
      embed: embed(),
    })

    const response = await handler(
      post('{}', { Authorization: 'Bearer abc.def.ghi' }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ embedded: 1, done: true })
    expect(authenticate).toHaveBeenCalledWith('Bearer abc.def.ghi')
    expect(chunks).toHaveBeenCalledWith({
      userId: 'user-1',
      accessToken: 'token-1',
    })
    expect(store.save).toHaveBeenCalledWith([
      { id: 'doc-1:0', embedding: [0.5] },
    ])
  })

  it('answers 401 without a session, before any model call', async () => {
    const embedder = embed()
    const handler = createEmbedFunction({
      authenticate: deny,
      chunks: chunkStore().chunks,
      embed: embedder,
    })

    const response = await handler(post('{}'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthenticated' })
    expect(embedder).not.toHaveBeenCalled()
  })

  it('fails closed when nothing is configured', async () => {
    for (const name of [
      'SUPABASE_URL',
      'VITE_SUPABASE_URL',
      'SUPABASE_PUBLISHABLE_KEY',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'OLLAMA_BASE_URL',
    ]) {
      vi.stubEnv(name, '')
    }
    try {
      const handler = createEmbedFunction()

      const response = await handler(
        post('{}', { Authorization: 'Bearer looks-real' }),
      )

      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ error: 'not-configured' })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('answers malformed JSON with a JSON 400', async () => {
    const handler = createEmbedFunction({ authenticate: allow() })

    const response = await handler(post('{"oops"'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid-json' })
  })

  it('rejects a declared Content-Length over the limit without reading it', async () => {
    const authenticate = allow()
    const handler = createEmbedFunction({ authenticate })
    const request = post('{}', {
      'Content-Length': String(EMBED_BODY_LIMIT_BYTES + 1),
    })

    const response = await handler(request)

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: 'too-large' })
    expect(request.bodyUsed).toBe(false)
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('rejects an over-limit body that did not declare its length', async () => {
    const handler = createEmbedFunction({ authenticate: allow() })

    const response = await handler(
      streamed('x'.repeat(EMBED_BODY_LIMIT_BYTES + 1)),
    )

    expect(response.status).toBe(413)
  })

  it('marks every reply as uncacheable', async () => {
    const handler = createEmbedFunction({ authenticate: deny })

    for (const response of [
      await handler(post('{}')),
      await handler(post('{"oops"')),
      await embedFunction(new Request('https://example.test/api/embed')),
    ]) {
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    }
  })
})
