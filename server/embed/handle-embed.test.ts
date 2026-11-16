// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Authenticate } from '../auth/types.ts'
import { EmbedderError } from '../llm/ollama-embedder.ts'
import type { Embedder } from '../llm/ollama-embedder.ts'
import { ChunkStoreError } from './chunk-store.ts'
import type { ChunkStore, ChunkStoreFor, PendingChunk } from './chunk-store.ts'
import { handleEmbed } from './handle-embed.ts'
import type { EmbedDependencies } from './handle-embed.ts'
import { EMBED_CHUNKS_PER_REQUEST, EMBED_MAX_TEXT_CHARS } from './limits.ts'

const allow = vi.fn<Authenticate>(async () => ({
  ok: true,
  user: { id: 'user-1', aal: 'aal1' },
  accessToken: 'token-1',
}))

const chunk = (index: number): PendingChunk => ({
  id: `doc-1:${index}`,
  text: `Passage ${index}`,
})

/** An in-memory store holding `count` chunks without an embedding. */
function storeOf(count: number) {
  const pending = Array.from({ length: count }, (_, i) => chunk(i))
  const store = {
    pending: vi.fn<ChunkStore['pending']>(async (limit) =>
      pending.slice(0, limit),
    ),
    save: vi.fn<ChunkStore['save']>(async () => {}),
  }
  const storeFor = vi.fn<ChunkStoreFor>(() => store)
  return { store, storeFor }
}

const embedAll = vi.fn<Embedder>(async (texts) =>
  texts.map((_, i) => [i, i + 0.5]),
)

const deps = (
  overrides: Partial<EmbedDependencies> = {},
): EmbedDependencies => ({
  authenticate: allow,
  authorization: 'Bearer token-1',
  embed: embedAll,
  chunks: storeOf(2).storeFor,
  ...overrides,
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('handleEmbed', () => {
  it("embeds the caller's pending chunks and saves them through their own store", async () => {
    const { store, storeFor } = storeOf(2)

    const result = await handleEmbed({}, deps({ chunks: storeFor }))

    expect(result).toEqual({ status: 200, body: { embedded: 2, done: true } })
    expect(storeFor).toHaveBeenCalledWith({
      userId: 'user-1',
      accessToken: 'token-1',
    })
    expect(embedAll).toHaveBeenCalledWith(['Passage 0', 'Passage 1'])
    expect(store.save).toHaveBeenCalledWith([
      { id: 'doc-1:0', embedding: [0, 0.5] },
      { id: 'doc-1:1', embedding: [1, 1.5] },
    ])
  })

  it(`embeds at most ${EMBED_CHUNKS_PER_REQUEST} chunks and reports more remain`, async () => {
    const { store, storeFor } = storeOf(EMBED_CHUNKS_PER_REQUEST + 5)

    const result = await handleEmbed({}, deps({ chunks: storeFor }))

    expect(result.body).toEqual({
      embedded: EMBED_CHUNKS_PER_REQUEST,
      done: false,
    })
    // One extra row tells "exactly a page left" from "more to come".
    expect(store.pending).toHaveBeenCalledWith(EMBED_CHUNKS_PER_REQUEST + 1)
    expect(embedAll.mock.calls[0]![0]).toHaveLength(EMBED_CHUNKS_PER_REQUEST)
  })

  it('reports done with exactly one page left', async () => {
    const { storeFor } = storeOf(EMBED_CHUNKS_PER_REQUEST)

    const result = await handleEmbed({}, deps({ chunks: storeFor }))

    expect(result.body).toEqual({
      embedded: EMBED_CHUNKS_PER_REQUEST,
      done: true,
    })
  })

  it('skips the model when nothing is pending', async () => {
    const { store, storeFor } = storeOf(0)

    const result = await handleEmbed({}, deps({ chunks: storeFor }))

    expect(result).toEqual({ status: 200, body: { embedded: 0, done: true } })
    expect(embedAll).not.toHaveBeenCalled()
    expect(store.save).not.toHaveBeenCalled()
  })

  it('shortens over-long chunk text before embedding it', async () => {
    const store = {
      pending: vi.fn(async () => [
        { id: 'doc-1:0', text: 'x'.repeat(EMBED_MAX_TEXT_CHARS + 50) },
      ]),
      save: vi.fn(async () => {}),
    }

    await handleEmbed({}, deps({ chunks: () => store }))

    expect(embedAll.mock.calls[0]![0][0]).toHaveLength(EMBED_MAX_TEXT_CHARS)
  })

  describe('authentication', () => {
    it('passes the Authorization header to the authenticator', async () => {
      await handleEmbed({}, deps({ authorization: 'Bearer abc' }))

      expect(allow).toHaveBeenCalledWith('Bearer abc')
    })

    it.each([['missing'], ['invalid'], ['expired']] as const)(
      'answers 401 for a %s session, before any work',
      async (reason) => {
        const { storeFor } = storeOf(2)

        const result = await handleEmbed(
          {},
          deps({
            authenticate: async () => ({ ok: false, reason }),
            chunks: storeFor,
          }),
        )

        expect(result).toEqual({
          status: 401,
          body: { error: 'unauthenticated' },
        })
        expect(storeFor).not.toHaveBeenCalled()
        expect(embedAll).not.toHaveBeenCalled()
      },
    )

    it('answers 503 when sessions cannot be verified', async () => {
      const result = await handleEmbed(
        {},
        deps({
          authenticate: async () => ({ ok: false, reason: 'not-configured' }),
        }),
      )

      expect(result).toEqual({ status: 503, body: { error: 'not-configured' } })
    })
  })

  describe('request body', () => {
    it.each([
      ['null', null],
      ['an array', []],
      ['a string', 'embed'],
    ])('rejects %s', async (_name, body) => {
      const result = await handleEmbed(body, deps())

      expect(result.status).toBe(400)
      expect(result.body).toMatchObject({ error: 'invalid-request' })
    })

    it('ignores unknown properties', async () => {
      const result = await handleEmbed({ extra: 1 }, deps())

      expect(result.status).toBe(200)
    })
  })

  describe('configuration', () => {
    it('answers 503 without an embedder', async () => {
      const result = await handleEmbed({}, deps({ embed: null }))

      expect(result).toEqual({ status: 503, body: { error: 'not-configured' } })
    })

    it('answers 503 without Supabase settings', async () => {
      const result = await handleEmbed({}, deps({ chunks: null }))

      expect(result).toEqual({ status: 503, body: { error: 'not-configured' } })
    })
  })

  describe('failures', () => {
    it('answers 502 when chunks cannot be read', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const store = {
        pending: vi.fn(async () => {
          throw new ChunkStoreError()
        }),
        save: vi.fn(async () => {}),
      }

      const result = await handleEmbed({}, deps({ chunks: () => store }))

      expect(result).toEqual({
        status: 502,
        body: { error: 'materials-unavailable' },
      })
    })

    it('answers 502 when vectors cannot be written', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const { store, storeFor } = storeOf(1)
      store.save.mockRejectedValue(new ChunkStoreError())

      const result = await handleEmbed({}, deps({ chunks: storeFor }))

      expect(result).toEqual({
        status: 502,
        body: { error: 'materials-unavailable' },
      })
    })

    it.each([
      ['unreachable', 502, 'upstream-unreachable'],
      ['timeout', 502, 'upstream-unreachable'],
      ['failed', 502, 'upstream-failed'],
      ['rejected', 502, 'upstream-failed'],
      ['invalid-response', 502, 'upstream-failed'],
      ['unauthorized', 503, 'not-configured'],
      ['rate-limited', 503, 'rate-limited'],
    ] as const)(
      'maps an embedder %s failure to %i %s',
      async (kind, status, error) => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { store, storeFor } = storeOf(1)

        const result = await handleEmbed(
          {},
          deps({
            chunks: storeFor,
            embed: async () => {
              throw new EmbedderError(kind)
            },
          }),
        )

        expect(result).toEqual({ status, body: { error } })
        expect(store.save).not.toHaveBeenCalled()
      },
    )

    it('answers 502 for an unexpected embedder error', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await handleEmbed(
        {},
        deps({
          embed: async () => {
            throw new Error('boom')
          },
        }),
      )

      expect(result).toEqual({
        status: 502,
        body: { error: 'upstream-failed' },
      })
    })

    it('never logs chunk text', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warns = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const store = {
        pending: vi.fn(async () => [{ id: 'doc-1:0', text: 'SECRET-TEXT' }]),
        save: vi.fn(async () => {}),
      }

      await handleEmbed(
        {},
        deps({
          chunks: () => store,
          embed: async (texts) => {
            throw new Error(`could not embed ${texts.join()}`)
          },
        }),
      )

      for (const spy of [errors, warns]) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain('SECRET-TEXT')
      }
    })
  })
})
