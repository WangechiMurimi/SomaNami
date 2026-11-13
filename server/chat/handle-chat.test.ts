// @vitest-environment node
import Anthropic from '@anthropic-ai/sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatRequest } from '../../src/types/contracts.ts'
import type { Authenticate, AuthFailure } from '../auth/types.ts'
import type { Answerer, ModelAnswer } from '../llm/claude-answerer.ts'
import {
  handleChat,
  NO_PASSAGES_ANSWER,
  REFUSAL_ANSWER,
} from './handle-chat.ts'

const passage = (documentId: string, index: number) => ({
  documentId,
  chunkId: `${documentId}:${index}`,
  text: `Passage ${index} of ${documentId}.`,
  source: { type: 'page' as const, page: index + 1 },
})

const request = (overrides: Partial<ChatRequest> = {}): ChatRequest => ({
  question: 'What do mitochondria do?',
  passages: [passage('doc-1', 0), passage('doc-1', 1)],
  history: [],
  ...overrides,
})

const allow = vi.fn<Authenticate>().mockResolvedValue({
  ok: true,
  user: { id: 'user-1', aal: 'aal1' },
})

/** Dependencies for a request from a signed-in user. */
const signedIn = { authenticate: allow, authorization: 'Bearer valid' }

const deny = (reason: AuthFailure) =>
  vi.fn<Authenticate>().mockResolvedValue({ ok: false, reason })

const answering = (answer: ModelAnswer): Answerer =>
  vi.fn<Answerer>().mockResolvedValue({ kind: 'answer', answer })

describe('handleChat', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns a grounded answer with the citations the model gave', async () => {
    const answer = answering({
      answer: 'They produce ATP.',
      answerable: true,
      citations: ['doc-1:1'],
    })

    const result = await handleChat(request(), { answer, ...signedIn })

    expect(result).toEqual({
      status: 200,
      body: {
        answer: 'They produce ATP.',
        answerable: true,
        citations: [{ documentId: 'doc-1', chunkId: 'doc-1:1' }],
      },
    })
  })

  it('passes the validated request to the answerer', async () => {
    const answer = answering({ answer: 'x', answerable: true, citations: [] })
    const body = request({ history: [{ role: 'user', content: 'Earlier' }] })

    await handleChat(body, { answer, ...signedIn })

    expect(answer).toHaveBeenCalledWith(body)
  })

  it('drops citations to passages that were never sent', async () => {
    const answer = answering({
      answer: 'They produce ATP.',
      answerable: true,
      citations: ['doc-1:0', 'doc-9:4'],
    })

    const result = await handleChat(request(), { answer, ...signedIn })

    expect(result.body).toMatchObject({
      citations: [{ documentId: 'doc-1', chunkId: 'doc-1:0' }],
      answerable: true,
    })
  })

  it('lists a passage cited several times only once', async () => {
    const answer = answering({
      answer: 'x',
      answerable: true,
      citations: ['doc-1:0', 'doc-1:0'],
    })

    const result = await handleChat(request(), { answer, ...signedIn })

    expect(result.body).toMatchObject({ citations: [{ chunkId: 'doc-1:0' }] })
  })

  it('does not present an answer as grounded when none of its citations are real', async () => {
    const answer = answering({
      answer: 'Confident but unsupported.',
      answerable: true,
      citations: ['made-up'],
    })

    const result = await handleChat(request(), { answer, ...signedIn })

    expect(result.body).toEqual({
      answer: 'Confident but unsupported.',
      answerable: false,
      citations: [],
    })
  })

  it('strips citations from an answer the model marked unanswerable', async () => {
    const answer = answering({
      answer: 'The documents do not cover this.',
      answerable: false,
      citations: ['doc-1:0'],
    })

    const result = await handleChat(request(), { answer, ...signedIn })

    expect(result.body).toMatchObject({ answerable: false, citations: [] })
  })

  it('answers "not covered" without calling the model when no passages were retrieved', async () => {
    const answer = vi.fn<Answerer>()

    const result = await handleChat(request({ passages: [] }), {
      answer,
      ...signedIn,
    })

    expect(answer).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: 200,
      body: { answer: NO_PASSAGES_ANSWER, answerable: false, citations: [] },
    })
  })

  it('treats a safety refusal as unanswerable rather than an error', async () => {
    const answer = vi.fn<Answerer>().mockResolvedValue({ kind: 'refusal' })

    const result = await handleChat(request(), { answer, ...signedIn })

    expect(result).toEqual({
      status: 200,
      body: { answer: REFUSAL_ANSWER, answerable: false, citations: [] },
    })
  })

  it('rejects a malformed body with the problems listed', async () => {
    const answer = vi.fn<Answerer>()

    const result = await handleChat({ question: '' }, { answer, ...signedIn })

    expect(result.status).toBe(400)
    expect(result.body).toMatchObject({ error: 'invalid-request' })
    expect((result.body as { issues: string[] }).issues.join(' ')).toMatch(
      /question/,
    )
    expect(answer).not.toHaveBeenCalled()
  })

  it('reports a missing API key as a server-side configuration problem', async () => {
    const result = await handleChat(request(), { answer: null, ...signedIn })

    expect(result).toEqual({ status: 503, body: { error: 'not-configured' } })
  })

  describe('when the Claude API fails', () => {
    const failing = (error: unknown): Answerer =>
      vi.fn<Answerer>().mockRejectedValue(error)
    const headers = new Headers()

    it('maps rate limiting to a retryable 503', async () => {
      const error = new Anthropic.RateLimitError(429, {}, 'slow down', headers)

      const result = await handleChat(request(), {
        answer: failing(error),
        ...signedIn,
      })

      expect(result).toEqual({ status: 503, body: { error: 'rate-limited' } })
    })

    it('maps a rejected API key to not-configured', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Anthropic.AuthenticationError(
        401,
        {},
        'bad key',
        headers,
      )

      const result = await handleChat(request(), {
        answer: failing(error),
        ...signedIn,
      })

      expect(result).toEqual({ status: 503, body: { error: 'not-configured' } })
    })

    it('maps a network failure to a retryable 502', async () => {
      const error = new Anthropic.APIConnectionError({ message: 'offline' })

      const result = await handleChat(request(), {
        answer: failing(error),
        ...signedIn,
      })

      expect(result).toEqual({
        status: 502,
        body: { error: 'upstream-unreachable' },
      })
    })

    it('maps anything else to a retryable 502 and logs it', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await handleChat(request(), {
        answer: failing(new Error('boom')),
        ...signedIn,
      })

      expect(result).toEqual({
        status: 502,
        body: { error: 'upstream-failed' },
      })
      expect(log).toHaveBeenCalled()
    })
  })

  describe('authentication', () => {
    it('checks the Authorization header it was given', async () => {
      const authenticate = vi.fn<Authenticate>().mockResolvedValue({
        ok: true,
        user: { id: 'user-1', aal: 'aal1' },
      })
      const answer = answering({ answer: 'x', answerable: true, citations: [] })

      await handleChat(request(), {
        answer,
        authenticate,
        authorization: 'Bearer abc',
      })

      expect(authenticate).toHaveBeenCalledWith('Bearer abc')
    })

    it.each(['missing', 'invalid', 'expired'] as const)(
      'answers a %s session with 401 before any model call',
      async (reason) => {
        const answer = answering({
          answer: 'x',
          answerable: true,
          citations: [],
        })

        const result = await handleChat(request(), {
          answer,
          authenticate: deny(reason),
          authorization: 'Bearer nope',
        })

        expect(result).toEqual({
          status: 401,
          body: { error: 'unauthenticated' },
        })
        expect(answer).not.toHaveBeenCalled()
      },
    )

    it('checks the session before validating the body', async () => {
      const result = await handleChat(
        { question: '' },
        {
          answer: null,
          authenticate: deny('missing'),
          authorization: undefined,
        },
      )

      expect(result.status).toBe(401)
    })

    it('answers 503 when the server cannot verify sessions', async () => {
      const answer = answering({ answer: 'x', answerable: true, citations: [] })

      const result = await handleChat(request(), {
        answer,
        authenticate: deny('not-configured'),
        authorization: 'Bearer abc',
      })

      expect(result).toEqual({
        status: 503,
        body: { error: 'not-configured' },
      })
      expect(answer).not.toHaveBeenCalled()
    })
  })
})
