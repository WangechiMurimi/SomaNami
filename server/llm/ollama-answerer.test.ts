// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { ChatRequest } from '../../src/types/contracts.ts'
import { UpstreamError } from './answerer.ts'
import {
  ANSWER_FORMAT,
  createOllamaAnswerer,
  DEFAULT_OLLAMA_MODEL,
  MAX_ANSWER_TOKENS,
} from './ollama-answerer.ts'
import { SYSTEM_PROMPT } from './prompt.ts'

const request: ChatRequest = {
  question: 'Why ATP?',
  passages: [
    {
      documentId: 'doc-1',
      chunkId: 'doc-1:0',
      text: 'Mitochondria produce ATP.',
      source: { type: 'page', page: 1 },
    },
  ],
  history: [],
}

const BASE_URL = 'http://ollama.test:11434/'
const API_KEY = 'secret-ollama-key'
const GOOD = { answer: 'ATP.', answerable: true, citations: ['doc-1:0'] }

/** An Ollama `/api/chat` reply whose message content is `content`. */
const reply = (content: string) =>
  Response.json({ model: DEFAULT_OLLAMA_MODEL, message: { content } })

const answerReply = (answer: unknown) => reply(JSON.stringify(answer))

function fakeFetch(...responses: (Response | Error)[]) {
  const fetch = vi.fn<typeof globalThis.fetch>()
  for (const response of responses) {
    if (response instanceof Error) fetch.mockRejectedValueOnce(response)
    else fetch.mockResolvedValueOnce(response)
  }
  return fetch
}

/** Captures what an answerer threw, so tests can inspect its fields. */
const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('expected the answerer to fail')
    },
    (error: unknown) => error as UpstreamError,
  )

const sentBody = (fetch: ReturnType<typeof fakeFetch>, call = 0) =>
  JSON.parse(String(fetch.mock.calls[call]?.[1]?.body))

const sentHeaders = (fetch: ReturnType<typeof fakeFetch>) =>
  new Headers(fetch.mock.calls[0]?.[1]?.headers)

describe('createOllamaAnswerer', () => {
  it('returns the validated structured answer', async () => {
    const fetch = fakeFetch(answerReply(GOOD))

    await expect(
      createOllamaAnswerer({ baseUrl: BASE_URL, fetch })(request),
    ).resolves.toEqual({ kind: 'answer', answer: GOOD })
  })

  it('posts a non-streaming, schema-constrained, deterministic chat request', async () => {
    const fetch = fakeFetch(answerReply(GOOD))

    await createOllamaAnswerer({ baseUrl: BASE_URL, fetch })(request)

    expect(fetch.mock.calls[0]?.[0]).toBe('http://ollama.test:11434/api/chat')
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('POST')
    const body = sentBody(fetch)
    expect(body).toMatchObject({
      model: DEFAULT_OLLAMA_MODEL,
      stream: false,
      format: ANSWER_FORMAT,
      options: { temperature: 0, num_predict: MAX_ANSWER_TOKENS },
    })
    expect(body.messages[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT })
    expect(body.messages.at(-1).content).toContain('Why ATP?')
  })

  it('constrains output to the answer schema without a $schema key', () => {
    expect(ANSWER_FORMAT).toEqual({
      type: 'object',
      properties: {
        answer: { type: 'string' },
        answerable: { type: 'boolean' },
        citations: { type: 'array', items: { type: 'string' } },
      },
      required: ['answer', 'answerable', 'citations'],
      additionalProperties: false,
    })
  })

  it('honours a model override', async () => {
    const fetch = fakeFetch(answerReply(GOOD))

    await createOllamaAnswerer({ baseUrl: BASE_URL, model: 'llama3', fetch })(
      request,
    )

    expect(sentBody(fetch).model).toBe('llama3')
  })

  it('sends a bearer token only when a key is set', async () => {
    const withKey = fakeFetch(answerReply(GOOD))
    const withoutKey = fakeFetch(answerReply(GOOD))

    await createOllamaAnswerer({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      fetch: withKey,
    })(request)
    await createOllamaAnswerer({ baseUrl: BASE_URL, fetch: withoutKey })(
      request,
    )

    expect(sentHeaders(withKey).get('authorization')).toBe(`Bearer ${API_KEY}`)
    expect(sentHeaders(withoutKey).has('authorization')).toBe(false)
  })

  it('passes an unanswerable reply through for the route to handle', async () => {
    const unanswerable = {
      answer: 'The documents do not cover this.',
      answerable: false,
      citations: [],
    }
    const fetch = fakeFetch(answerReply(unanswerable))

    await expect(
      createOllamaAnswerer({ baseUrl: BASE_URL, fetch })(request),
    ).resolves.toEqual({ kind: 'answer', answer: unanswerable })
  })

  it.each([
    ['invalid JSON', reply('{"answer": "ATP.", ')],
    ['JSON that breaks the schema', answerReply({ answer: 'ATP.' })],
  ])('retries once after %s', async (_label, bad) => {
    const fetch = fakeFetch(bad, answerReply(GOOD))

    await expect(
      createOllamaAnswerer({ baseUrl: BASE_URL, fetch })(request),
    ).resolves.toEqual({ kind: 'answer', answer: GOOD })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sentBody(fetch, 1)).toEqual(sentBody(fetch, 0))
  })

  it('fails upstream when the retry is invalid too', async () => {
    const fetch = fakeFetch(reply('not json'), reply('still not json'))

    const error = await failureOf(
      createOllamaAnswerer({ baseUrl: BASE_URL, fetch })(request),
    )

    expect(error).toBeInstanceOf(UpstreamError)
    expect(error.kind).toBe('failed')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('times out when Ollama does not answer before the deadline', async () => {
    // Settles only when aborted, like a real fetch to a stalled server.
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )

    const error = await failureOf(
      createOllamaAnswerer({ baseUrl: BASE_URL, timeoutMs: 5, fetch })(request),
    )

    expect(error).toBeInstanceOf(UpstreamError)
    expect(error.kind).toBe('timeout')
  })

  it('reports a network failure as unreachable', async () => {
    const fetch = fakeFetch(new TypeError('fetch failed'))

    const error = await failureOf(
      createOllamaAnswerer({ baseUrl: BASE_URL, fetch })(request),
    )

    expect(error).toBeInstanceOf(UpstreamError)
    expect(error.kind).toBe('unreachable')
  })

  it.each([
    [401, 'not-configured'],
    [403, 'not-configured'],
    [429, 'rate-limited'],
    [503, 'rate-limited'],
    [404, 'failed'],
    [500, 'failed'],
  ])('maps a %i response to %s without retrying', async (status, kind) => {
    const fetch = fakeFetch(
      Response.json({ error: 'nope' }, { status }),
      answerReply(GOOD),
    )

    const error = await failureOf(
      createOllamaAnswerer({ baseUrl: BASE_URL, fetch })(request),
    )

    expect(error).toBeInstanceOf(UpstreamError)
    expect(error.kind).toBe(kind)
    expect(error.message).toContain(String(status))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('never puts the API key in an error message', async () => {
    const fetch = fakeFetch(
      new Response(`invalid token ${API_KEY}`, { status: 401 }),
    )

    const error = await failureOf(
      createOllamaAnswerer({ baseUrl: BASE_URL, apiKey: API_KEY, fetch })(
        request,
      ),
    )

    expect(error.message).not.toContain(API_KEY)
    expect(error.message).toContain('[redacted]')
  })

  it('fails upstream when the reply has no message content', async () => {
    const fetch = fakeFetch(Response.json({ done: true }))

    const error = await failureOf(
      createOllamaAnswerer({ baseUrl: BASE_URL, fetch })(request),
    )

    expect(error.kind).toBe('failed')
  })
})
