// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createEmbedderFromEnv,
  createOllamaEmbedder,
  EMBED_BATCH_SIZE,
  EMBED_DIMENSIONS,
  EmbedderError,
} from './ollama-embedder.ts'
import type { OllamaEmbedderOptions } from './ollama-embedder.ts'

const BASE_URL = 'https://ollama.example.test'

const vector = (seed: number) =>
  Array.from({ length: EMBED_DIMENSIONS }, (_, i) => (seed + i) / 1000)

/** Ollama's `/api/embed` reply for these inputs. */
const embedReply = (inputs: readonly string[]) =>
  Response.json({
    model: 'nomic-embed-text',
    embeddings: inputs.map((_, index) => vector(index)),
  })

/** A fake Ollama that embeds whatever it is sent. */
const ollama = () =>
  vi.fn<typeof fetch>(async (_url, init) => {
    const { input } = JSON.parse(String(init?.body)) as { input: string[] }
    return embedReply(input)
  })

/** Builds an embedder that never really waits between retries. */
const embedderWith = (
  fetch: typeof globalThis.fetch,
  options: Partial<OllamaEmbedderOptions> = {},
) =>
  createOllamaEmbedder({
    baseUrl: BASE_URL,
    fetch,
    sleep: async () => {},
    ...options,
  })

const sentBody = (fetch: ReturnType<typeof ollama>, call = 0) =>
  JSON.parse(String(fetch.mock.calls[call]?.[1]?.body)) as {
    model: string
    input: string[]
  }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createOllamaEmbedder', () => {
  it('posts the texts to /api/embed and returns one vector per text', async () => {
    const fetch = ollama()
    const embed = embedderWith(fetch)

    const vectors = await embed(['Cells divide.', 'Mitosis.'])

    expect(vectors).toEqual([vector(0), vector(1)])
    const [url, init] = fetch.mock.calls[0]!
    expect(String(url)).toBe(`${BASE_URL}/api/embed`)
    expect(init?.method).toBe('POST')
    expect(sentBody(fetch)).toMatchObject({
      model: 'nomic-embed-text',
      input: ['Cells divide.', 'Mitosis.'],
    })
  })

  it('uses the configured model', async () => {
    const fetch = ollama()

    await embedderWith(fetch, { model: 'mxbai-embed-large' })(['x'])

    expect(sentBody(fetch).model).toBe('mxbai-embed-large')
  })

  it('tolerates a trailing slash on the base URL', async () => {
    const fetch = ollama()

    await embedderWith(fetch, { baseUrl: `${BASE_URL}/` })(['x'])

    expect(String(fetch.mock.calls[0]![0])).toBe(`${BASE_URL}/api/embed`)
  })

  it('sends the gateway key as a bearer token when one is set', async () => {
    const fetch = ollama()

    await embedderWith(fetch, { apiKey: 'gateway-key' })(['x'])

    const headers = new Headers(fetch.mock.calls[0]![1]?.headers)
    expect(headers.get('authorization')).toBe('Bearer gateway-key')
    expect(headers.get('content-type')).toBe('application/json')
  })

  it('sends no Authorization header without a key', async () => {
    const fetch = ollama()

    await embedderWith(fetch)(['x'])

    const headers = new Headers(fetch.mock.calls[0]![1]?.headers)
    expect(headers.has('authorization')).toBe(false)
  })

  it('makes no request for no texts', async () => {
    const fetch = ollama()

    expect(await embedderWith(fetch)([])).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it(`splits large inputs into batches of ${EMBED_BATCH_SIZE}, in order`, async () => {
    const fetch = ollama()
    const texts = Array.from(
      { length: EMBED_BATCH_SIZE * 2 + 1 },
      (_, i) => `t${i}`,
    )

    const vectors = await embedderWith(fetch)(texts)

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(sentBody(fetch, 0).input).toEqual(texts.slice(0, EMBED_BATCH_SIZE))
    expect(sentBody(fetch, 2).input).toEqual(texts.slice(EMBED_BATCH_SIZE * 2))
    expect(vectors).toHaveLength(texts.length)
    // Each batch's vectors land at their texts' positions.
    expect(vectors[EMBED_BATCH_SIZE]).toEqual(vector(0))
  })

  it('honours a custom batch size', async () => {
    const fetch = ollama()

    await embedderWith(fetch, { batchSize: 2 })(['a', 'b', 'c'])

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  describe('retries', () => {
    it('retries a 5xx and succeeds', async () => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(new Response('busy', { status: 503 }))
        .mockResolvedValueOnce(embedReply(['x']))
      const sleep = vi.fn(async () => {})

      const vectors = await embedderWith(fetch, { sleep })(['x'])

      expect(vectors).toEqual([vector(0)])
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(sleep).toHaveBeenCalledTimes(1)
    })

    it('retries a network failure', async () => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(embedReply(['x']))

      expect(await embedderWith(fetch)(['x'])).toEqual([vector(0)])
    })

    it('backs off exponentially between attempts', async () => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response('down', { status: 502 }))
      const sleep = vi.fn(async () => {})

      await expect(
        embedderWith(fetch, { sleep, maxAttempts: 3, backoffMs: 100 })(['x']),
      ).rejects.toMatchObject({ kind: 'failed', status: 502 })

      expect(fetch).toHaveBeenCalledTimes(3)
      expect(sleep.mock.calls).toEqual([[100], [200]])
    })

    it('gives up as unreachable after repeated network failures', async () => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockRejectedValue(new TypeError('fetch failed'))

      const failure = embedderWith(fetch, { maxAttempts: 2 })(['x'])

      await expect(failure).rejects.toBeInstanceOf(EmbedderError)
      await expect(failure).rejects.toMatchObject({ kind: 'unreachable' })
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('aborts an attempt that runs past its timeout, then retries', async () => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementationOnce(
          (_url, init) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () =>
                reject(init.signal?.reason),
              )
            }),
        )
        .mockResolvedValueOnce(embedReply(['x']))

      const vectors = await embedderWith(fetch, { attemptTimeoutMs: 5 })(['x'])

      expect(vectors).toEqual([vector(0)])
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('reports a timeout when every attempt times out', async () => {
      const hang = vi.fn<typeof globalThis.fetch>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(init.signal?.reason),
            )
          }),
      )

      await expect(
        embedderWith(hang, { attemptTimeoutMs: 5, maxAttempts: 2 })(['x']),
      ).rejects.toMatchObject({ kind: 'timeout' })
    })

    it('stops retrying once the overall budget is spent', async () => {
      let clock = 0
      const fetch = vi.fn<typeof globalThis.fetch>(async () => {
        clock += 1_000
        return new Response('down', { status: 500 })
      })

      await expect(
        embedderWith(fetch, {
          now: () => clock,
          budgetMs: 1_500,
          maxAttempts: 5,
        })(['x']),
      ).rejects.toMatchObject({ kind: 'failed' })

      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it.each([
      [400, 'rejected'],
      [404, 'rejected'],
      [401, 'unauthorized'],
      [403, 'unauthorized'],
      [429, 'rate-limited'],
    ])('does not retry a %i (%s)', async (status, kind) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response('no', { status }))

      await expect(embedderWith(fetch)(['x'])).rejects.toMatchObject({
        kind,
        status,
      })
      expect(fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('response validation', () => {
    const replying = (body: unknown) =>
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(body))

    it('rejects a reply with the wrong number of vectors', async () => {
      const fetch = replying({ embeddings: [vector(0)] })

      await expect(embedderWith(fetch)(['a', 'b'])).rejects.toMatchObject({
        kind: 'invalid-response',
      })
      // A malformed reply won't improve on a retry.
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('rejects vectors of the wrong size', async () => {
      const fetch = replying({ embeddings: [[0.1, 0.2]] })

      await expect(embedderWith(fetch)(['a'])).rejects.toMatchObject({
        kind: 'invalid-response',
      })
    })

    it('rejects non-numeric values', async () => {
      const bad = vector(0)
      ;(bad as unknown[])[3] = 'x'

      await expect(
        embedderWith(replying({ embeddings: [bad] }))(['a']),
      ).rejects.toMatchObject({ kind: 'invalid-response' })
    })

    it('rejects a reply that is not JSON', async () => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response('<html>', { status: 200 }))

      await expect(embedderWith(fetch)(['a'])).rejects.toMatchObject({
        kind: 'invalid-response',
      })
    })
  })

  it('never logs the texts it embeds', async () => {
    const logs = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ]
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('down', { status: 500 }))

    await expect(
      embedderWith(fetch, { maxAttempts: 2 })(['SECRET-LEARNER-TEXT']),
    ).rejects.toThrow()

    for (const log of logs) {
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        'SECRET-LEARNER-TEXT',
      )
    }
  })

  it('never puts the texts in its error', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('bad input SECRET', { status: 400 }))

    const error = await embedderWith(fetch)(['SECRET']).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(EmbedderError)
    expect(String((error as Error).message)).not.toContain('SECRET')
  })
})

describe('createEmbedderFromEnv', () => {
  it('returns null without OLLAMA_BASE_URL', () => {
    expect(createEmbedderFromEnv({})).toBeNull()
    expect(createEmbedderFromEnv({ OLLAMA_BASE_URL: '  ' })).toBeNull()
  })

  it('builds an embedder for an https URL', () => {
    expect(
      createEmbedderFromEnv({ OLLAMA_BASE_URL: 'https://ollama.example.test' }),
    ).toBeTypeOf('function')
  })

  it('allows plain http only on this machine', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(
      createEmbedderFromEnv({ OLLAMA_BASE_URL: 'http://localhost:11434' }),
    ).toBeTypeOf('function')
    expect(
      createEmbedderFromEnv({ OLLAMA_BASE_URL: 'http://127.0.0.1:11434' }),
    ).toBeTypeOf('function')
    // Learner text must never cross the internet unencrypted.
    expect(
      createEmbedderFromEnv({ OLLAMA_BASE_URL: 'http://ollama.example.test' }),
    ).toBeNull()
  })

  it('refuses a URL it cannot parse', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(createEmbedderFromEnv({ OLLAMA_BASE_URL: 'not a url' })).toBeNull()
  })

  it('passes the key and embedding model through', async () => {
    const fetch = ollama()
    vi.stubGlobal('fetch', fetch)
    try {
      const embed = createEmbedderFromEnv({
        OLLAMA_BASE_URL: 'https://ollama.example.test',
        OLLAMA_API_KEY: 'gateway-key',
        OLLAMA_EMBED_MODEL: 'custom-embed',
      })

      await embed!(['x'])

      const headers = new Headers(fetch.mock.calls[0]![1]?.headers)
      expect(headers.get('authorization')).toBe('Bearer gateway-key')
      expect(sentBody(fetch).model).toBe('custom-embed')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
