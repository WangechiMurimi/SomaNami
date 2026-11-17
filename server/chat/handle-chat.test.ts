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
import type { ChatDependencies } from './handle-chat.ts'
import { MaterialsUnavailableError } from './load-materials.ts'
import type { LoadedMaterial, LoadMaterials } from './load-materials.ts'
import { allowUser } from '../testing/fixtures.ts'

const chunk = (documentId: string, index: number, text: string) => ({
  id: `${documentId}:${index}`,
  text,
  source: { type: 'page' as const, page: index + 1 },
})

/**
 * Each user's materials, as RLS would let that user see them. The fake loader
 * below answers only from the caller's own shelf, like the real query does.
 */
const LIBRARY: Record<string, LoadedMaterial[]> = {
  'user-1': [
    {
      id: 'doc-1',
      name: 'Cell biology.pdf',
      chunks: [
        chunk('doc-1', 0, 'Mitochondria produce ATP, the energy of the cell.'),
        chunk('doc-1', 1, 'Mitochondria carry their own small genome.'),
        chunk('doc-1', 2, 'The nucleus stores most of the DNA.'),
      ],
    },
    {
      id: 'doc-2',
      name: 'Plants.pdf',
      chunks: [chunk('doc-2', 0, 'Photosynthesis happens in chloroplasts.')],
    },
  ],
  'user-2': [
    {
      id: 'doc-9',
      name: 'Someone else.pdf',
      chunks: [chunk('doc-9', 0, 'Mitochondria notes that belong to user 2.')],
    },
  ],
}

const fromLibrary = () =>
  vi.fn<LoadMaterials>(async ({ userId, materialIds }) =>
    (LIBRARY[userId] ?? []).filter(({ id }) => materialIds.includes(id)),
  )

const request = (overrides: Partial<ChatRequest> = {}): ChatRequest => ({
  question: 'What do mitochondria do?',
  materialIds: ['doc-1'],
  history: [],
  ...overrides,
})

const allow = allowUser()

/** Dependencies for a request from a signed-in user with a working database. */
const signedIn = (
  overrides: Partial<ChatDependencies> = {},
): Omit<ChatDependencies, 'answer'> => ({
  authenticate: allow,
  authorization: 'Bearer token-of-user-1',
  loadMaterials: fromLibrary(),
  ...overrides,
})

const deny = (reason: AuthFailure) =>
  vi.fn<Authenticate>().mockResolvedValue({ ok: false, reason })

const answering = (answer: ModelAnswer) =>
  vi.fn<Answerer>().mockResolvedValue({ kind: 'answer', answer })

const notCovered = {
  answer: NO_PASSAGES_ANSWER,
  answerable: false,
  citations: [],
  passages: [],
}

describe('handleChat', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns a grounded answer with the citations the model gave', async () => {
    const answer = answering({
      answer: 'They produce ATP.',
      answerable: true,
      citations: ['doc-1:1'],
    })

    const result = await handleChat(request(), { answer, ...signedIn() })

    expect(result).toEqual({
      status: 200,
      body: {
        answer: 'They produce ATP.',
        answerable: true,
        citations: [{ documentId: 'doc-1', chunkId: 'doc-1:1' }],
        passages: [
          {
            documentId: 'doc-1',
            chunkId: 'doc-1:1',
            documentName: 'Cell biology.pdf',
            text: 'Mitochondria carry their own small genome.',
            source: { type: 'page', page: 2 },
          },
        ],
      },
    })
  })

  it('gives the answerer only the passages that match the question', async () => {
    const answer = answering({ answer: 'x', answerable: true, citations: [] })
    const history = [{ role: 'user' as const, content: 'Earlier' }]

    await handleChat(request({ materialIds: ['doc-1', 'doc-2'], history }), {
      answer,
      ...signedIn(),
    })

    expect(answer).toHaveBeenCalledOnce()
    const given = answer.mock.calls[0]![0]
    expect(given.question).toBe('What do mitochondria do?')
    expect(given.history).toEqual(history)
    // The nucleus and photosynthesis chunks don't mention mitochondria.
    expect(given.passages.map(({ chunkId }) => chunkId).sort()).toEqual([
      'doc-1:0',
      'doc-1:1',
    ])
  })

  it('loads materials with the verified user id and token', async () => {
    const loadMaterials = fromLibrary()
    const answer = answering({ answer: 'x', answerable: true, citations: [] })

    await handleChat(request({ materialIds: ['doc-1', 'doc-2'] }), {
      answer,
      ...signedIn({ loadMaterials }),
    })

    expect(loadMaterials).toHaveBeenCalledWith({
      userId: 'user-1',
      accessToken: 'token-of-user-1',
      materialIds: ['doc-1', 'doc-2'],
    })
  })

  it("answers another user's material ids as not covered, without calling the model", async () => {
    const answer = vi.fn<Answerer>()

    // doc-9 is user 2's; RLS hides it from user 1, so it loads as nothing.
    const result = await handleChat(request({ materialIds: ['doc-9'] }), {
      answer,
      ...signedIn(),
    })

    expect(answer).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 200, body: notCovered })
  })

  it('answers an unknown material id as not covered', async () => {
    const answer = vi.fn<Answerer>()

    const result = await handleChat(request({ materialIds: ['no-such-doc'] }), {
      answer,
      ...signedIn(),
    })

    expect(answer).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 200, body: notCovered })
  })

  it('answers no materials as not covered without touching the database', async () => {
    const loadMaterials = fromLibrary()
    const answer = vi.fn<Answerer>()

    const result = await handleChat(request({ materialIds: [] }), {
      answer,
      ...signedIn({ loadMaterials }),
    })

    expect(loadMaterials).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 200, body: notCovered })
  })

  it('drops citations to passages that were never given to the model', async () => {
    const answer = answering({
      answer: 'They produce ATP.',
      answerable: true,
      // doc-1:2 was loaded but not retrieved; doc-9:0 is another user's.
      citations: ['doc-1:0', 'doc-1:2', 'doc-9:0'],
    })

    const result = await handleChat(request(), { answer, ...signedIn() })

    expect(result.body).toMatchObject({
      citations: [{ documentId: 'doc-1', chunkId: 'doc-1:0' }],
      answerable: true,
      passages: [{ chunkId: 'doc-1:0' }],
    })
    expect((result.body as { passages: unknown[] }).passages).toHaveLength(1)
  })

  it('lists a passage cited several times only once', async () => {
    const answer = answering({
      answer: 'x',
      answerable: true,
      citations: ['doc-1:0', 'doc-1:0'],
    })

    const result = await handleChat(request(), { answer, ...signedIn() })

    expect(result.body).toMatchObject({
      citations: [{ chunkId: 'doc-1:0' }],
      passages: [{ chunkId: 'doc-1:0' }],
    })
  })

  it('does not present an answer as grounded when none of its citations are real', async () => {
    const answer = answering({
      answer: 'Confident but unsupported.',
      answerable: true,
      citations: ['made-up'],
    })

    const result = await handleChat(request(), { answer, ...signedIn() })

    expect(result.body).toEqual({
      answer: 'Confident but unsupported.',
      answerable: false,
      citations: [],
      passages: [],
    })
  })

  it('strips citations from an answer the model marked unanswerable', async () => {
    const answer = answering({
      answer: 'The documents do not cover this.',
      answerable: false,
      citations: ['doc-1:0'],
    })

    const result = await handleChat(request(), { answer, ...signedIn() })

    expect(result.body).toMatchObject({
      answerable: false,
      citations: [],
      passages: [],
    })
  })

  it('lets the model judge coverage when strict retrieval finds nothing', async () => {
    const answer = vi.fn<Answerer>().mockResolvedValue({
      kind: 'answer',
      answer: {
        answer: 'Your notes are about cells, not football.',
        answerable: false,
        citations: [],
      },
    })

    const result = await handleChat(
      request({ question: 'Who won the 1998 World Cup?' }),
      { answer, ...signedIn() },
    )

    // The model sees the material's opening rather than nothing at all...
    expect(
      answer.mock.calls[0]?.[0].passages.map(({ chunkId }) => chunkId),
    ).toEqual(['doc-1:0', 'doc-1:1', 'doc-1:2'])
    // ...and its "not covered" verdict reaches the learner unchanged.
    expect(result).toEqual({
      status: 200,
      body: {
        answer: 'Your notes are about cells, not football.',
        answerable: false,
        citations: [],
        passages: [],
      },
    })
  })

  it('answers "not covered" without calling the model when the materials have no text', async () => {
    const answer = vi.fn<Answerer>()
    const empty = vi
      .fn<LoadMaterials>()
      .mockResolvedValue([{ id: 'doc-1', name: 'Scan.pdf', chunks: [] }])

    const result = await handleChat(request(), {
      answer,
      ...signedIn({ loadMaterials: empty }),
    })

    expect(answer).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 200, body: notCovered })
  })

  it('treats a safety refusal as unanswerable rather than an error', async () => {
    const answer = vi.fn<Answerer>().mockResolvedValue({ kind: 'refusal' })

    const result = await handleChat(request(), { answer, ...signedIn() })

    expect(result).toEqual({
      status: 200,
      body: {
        answer: REFUSAL_ANSWER,
        answerable: false,
        citations: [],
        passages: [],
      },
    })
  })

  it('rejects a malformed body with the problems listed', async () => {
    const answer = vi.fn<Answerer>()

    const result = await handleChat({ question: '' }, { answer, ...signedIn() })

    expect(result.status).toBe(400)
    expect(result.body).toMatchObject({ error: 'invalid-request' })
    expect((result.body as { issues: string[] }).issues.join(' ')).toMatch(
      /question/,
    )
    expect(answer).not.toHaveBeenCalled()
  })

  it('reports a missing API key as a server-side configuration problem', async () => {
    const result = await handleChat(request(), { answer: null, ...signedIn() })

    expect(result).toEqual({ status: 503, body: { error: 'not-configured' } })
  })

  describe('when materials cannot be loaded', () => {
    it('reports missing Supabase settings as not-configured', async () => {
      const answer = vi.fn<Answerer>()

      const result = await handleChat(request(), {
        answer,
        ...signedIn({ loadMaterials: null }),
      })

      expect(result).toEqual({
        status: 503,
        body: { error: 'not-configured' },
      })
      expect(answer).not.toHaveBeenCalled()
    })

    it('answers a JSON 502 and logs only the kind of failure', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      const answer = vi.fn<Answerer>()
      const loadMaterials = vi.fn<LoadMaterials>().mockRejectedValue(
        new MaterialsUnavailableError({
          cause: { code: 'PGRST301', message: 'row doc-1 secret text' },
        }),
      )

      const result = await handleChat(request(), {
        answer,
        ...signedIn({ loadMaterials }),
      })

      expect(result).toEqual({
        status: 502,
        body: { error: 'materials-unavailable' },
      })
      expect(answer).not.toHaveBeenCalled()
      expect(log).toHaveBeenCalledWith(
        'Loading chat materials failed',
        'MaterialsUnavailableError (PGRST301)',
      )
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret text/)
    })
  })

  describe('when the Claude API fails', () => {
    const failing = (error: unknown): Answerer =>
      vi.fn<Answerer>().mockRejectedValue(error)
    const headers = new Headers()

    it('maps rate limiting to a retryable 503', async () => {
      const error = new Anthropic.RateLimitError(429, {}, 'slow down', headers)

      const result = await handleChat(request(), {
        answer: failing(error),
        ...signedIn(),
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
        ...signedIn(),
      })

      expect(result).toEqual({ status: 503, body: { error: 'not-configured' } })
    })

    it('maps a network failure to a retryable 502', async () => {
      const error = new Anthropic.APIConnectionError({ message: 'offline' })

      const result = await handleChat(request(), {
        answer: failing(error),
        ...signedIn(),
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
        ...signedIn(),
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
      const authenticate = allowUser('abc')
      const answer = answering({ answer: 'x', answerable: true, citations: [] })

      await handleChat(request(), {
        answer,
        ...signedIn({ authenticate, authorization: 'Bearer abc' }),
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

        const loadMaterials = fromLibrary()

        const result = await handleChat(request(), {
          answer,
          ...signedIn({
            authenticate: deny(reason),
            authorization: 'Bearer nope',
            loadMaterials,
          }),
        })

        expect(result).toEqual({
          status: 401,
          body: { error: 'unauthenticated' },
        })
        expect(loadMaterials).not.toHaveBeenCalled()
        expect(answer).not.toHaveBeenCalled()
      },
    )

    it('checks the session before validating the body', async () => {
      const result = await handleChat(
        { question: '' },
        {
          answer: null,
          ...signedIn({
            authenticate: deny('missing'),
            authorization: undefined,
          }),
        },
      )

      expect(result.status).toBe(401)
    })

    it('answers 503 when the server cannot verify sessions', async () => {
      const answer = answering({ answer: 'x', answerable: true, citations: [] })

      const result = await handleChat(request(), {
        answer,
        ...signedIn({ authenticate: deny('not-configured') }),
      })

      expect(result).toEqual({
        status: 503,
        body: { error: 'not-configured' },
      })
      expect(answer).not.toHaveBeenCalled()
    })
  })
})
