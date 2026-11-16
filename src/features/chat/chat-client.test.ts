import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSupabaseClient } from '../../lib/auth/supabase-client.ts'
import {
  askQuestion,
  DEFAULT_WAKE_RETRY_SECONDS,
  MODEL_WAKING_MESSAGE,
  RATE_LIMITED_MESSAGE,
  SESSION_ENDED_MESSAGE,
} from './chat-client.ts'

const cited = {
  documentId: 'doc-1',
  chunkId: 'doc-1:1',
  documentName: 'Cells.pdf',
  text: 'Mitochondria make ATP.',
  source: { type: 'page', page: 2 },
}

const reply = {
  answer: 'Yes.',
  citations: [{ documentId: 'doc-1', chunkId: 'doc-1:1' }],
  answerable: true,
  passages: [cited],
}

/** Stubs `fetch` with a fake that only implements what `askQuestion` reads. */
function mockFetch(implementation: () => Promise<Partial<Response>>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(
    // Deliberately partial: a full Response would hide which fields matter.
    implementation as unknown as typeof fetch,
  )
}

const session = (token: string | null) => ({
  data: { session: token ? { access_token: token } : null },
  error: null,
})

/** A Supabase client whose session hands out `current`, then `fresh` on refresh. */
function fakeSupabase({ fresh = 'fresh' as string | null } = {}) {
  const auth = {
    getSession: vi.fn().mockResolvedValue(session('current')),
    refreshSession: vi.fn().mockResolvedValue(session(fresh)),
  }
  setSupabaseClient({ auth } as unknown as SupabaseClient)
  return auth
}

/** The Authorization header of the nth fetch call. */
const authorizationOf = (fetchMock: ReturnType<typeof mockFetch>, n: number) =>
  new Headers(fetchMock.mock.calls[n]?.[1]?.headers).get('Authorization')

beforeEach(() => {
  fakeSupabase()
})

afterEach(() => {
  vi.restoreAllMocks()
  setSupabaseClient(undefined)
})

describe('askQuestion', () => {
  it('posts the contract request shape and returns the reply', async () => {
    const fetchMock = mockFetch(async () => ({
      ok: true,
      json: async () => reply,
    }))

    await expect(
      askQuestion({ question: 'Why?', materialIds: ['doc-1'], history: [] }),
    ).resolves.toEqual(reply)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/chat')
    expect(init?.method).toBe('POST')
    // Only ids travel: the server loads the material text itself.
    expect(JSON.parse(String(init?.body))).toEqual({
      question: 'Why?',
      materialIds: ['doc-1'],
      history: [],
    })
  })

  it('reports an unreachable service as a plain, retryable failure', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(askQuestion({ question: 'Why?' })).rejects.toMatchObject({
      code: 'network',
      message: 'Couldn’t get an answer. Try again.',
      retryable: true,
    })
  })

  it('only offers a retry for server-side failures', async () => {
    mockFetch(async () => ({ ok: false, status: 400 }))
    await expect(askQuestion({ question: 'Why?' })).rejects.toMatchObject({
      retryable: false,
    })

    mockFetch(async () => ({ ok: false, status: 503 }))
    await expect(askQuestion({ question: 'Why?' })).rejects.toMatchObject({
      message: 'Couldn’t get an answer. Try again.',
      retryable: true,
    })
  })

  it.each([
    ['only an answer', { answer: 'Yes.' }],
    ['no passages', { answer: 'Yes.', citations: [], answerable: true }],
    [
      'a passage without its document name',
      { ...reply, passages: [{ ...cited, documentName: undefined }] },
    ],
    ['a passage without text', { ...reply, passages: [{ ...cited, text: 1 }] }],
  ])('rejects a reply with %s', async (_label, body) => {
    mockFetch(async () => ({ ok: true, json: async () => body }))
    await expect(askQuestion({ question: 'Why?' })).rejects.toMatchObject({
      code: 'malformed',
      retryable: false,
    })
  })

  describe('session token', () => {
    it('sends the access token as a Bearer header', async () => {
      const fetchMock = mockFetch(async () => ({
        ok: true,
        json: async () => reply,
      }))

      await askQuestion({ question: 'Why?' })

      expect(authorizationOf(fetchMock, 0)).toBe('Bearer current')
    })

    it('fails without a request when there is no session', async () => {
      setSupabaseClient(null)
      const fetchMock = mockFetch(async () => ({
        ok: true,
        json: async () => reply,
      }))

      await expect(askQuestion({ question: 'Why?' })).rejects.toMatchObject({
        code: 'unauthenticated',
        retryable: false,
        message: SESSION_ENDED_MESSAGE,
      })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('offers a retry when the session can’t refresh for lack of network', async () => {
      // Offline, supabase-js keeps the session but reports none.
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      const auth = fakeSupabase()
      auth.getSession.mockResolvedValue(session(null))
      const fetchMock = mockFetch(async () => ({
        ok: true,
        json: async () => reply,
      }))

      await expect(askQuestion({ question: 'Why?' })).rejects.toMatchObject({
        code: 'network',
        retryable: true,
      })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('refreshes the token once and retries after a 401', async () => {
      const auth = fakeSupabase()
      const fetchMock = mockFetch(async () => ({ ok: false, status: 401 }))
      fetchMock.mockImplementationOnce((async () => ({
        ok: false,
        status: 401,
      })) as unknown as typeof fetch)
      fetchMock.mockImplementationOnce((async () => ({
        ok: true,
        json: async () => reply,
      })) as unknown as typeof fetch)

      await expect(askQuestion({ question: 'Why?' })).resolves.toEqual(reply)

      expect(auth.refreshSession).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(authorizationOf(fetchMock, 1)).toBe('Bearer fresh')
    })

    it('reports an ended session after a second 401, without looping', async () => {
      const auth = fakeSupabase()
      const fetchMock = mockFetch(async () => ({ ok: false, status: 401 }))

      await expect(askQuestion({ question: 'Why?' })).rejects.toMatchObject({
        code: 'unauthenticated',
        retryable: false,
        message: SESSION_ENDED_MESSAGE,
      })

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(auth.refreshSession).toHaveBeenCalledTimes(1)
    })

    it('does not retry when the refresh yields no session', async () => {
      fakeSupabase({ fresh: null })
      const fetchMock = mockFetch(async () => ({ ok: false, status: 401 }))

      await expect(askQuestion({ question: 'Why?' })).rejects.toMatchObject({
        code: 'unauthenticated',
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  it('words a 429 as asking too quickly, and offers a retry', async () => {
    mockFetch(async () => ({ ok: false, status: 429 }))

    await expect(askQuestion({ question: 'Why?' })).rejects.toMatchObject({
      code: 'rate-limited',
      retryable: true,
      message: RATE_LIMITED_MESSAGE,
    })
  })

  describe('while the model starts up (#201)', () => {
    const waking = (body: unknown) =>
      mockFetch(async () => ({
        ok: false,
        status: 503,
        json: async () => body,
      }))

    it('reports model-waking with the server’s retry hint', async () => {
      waking({ error: 'model-waking', retryAfterSeconds: 20 })

      await expect(askQuestion({ question: 'Why?' })).rejects.toMatchObject({
        code: 'model-waking',
        message: MODEL_WAKING_MESSAGE,
        retryable: true,
        retryAfterSeconds: 20,
      })
    })

    it.each([
      [0, 5],
      [9999, 120],
      ['soon', DEFAULT_WAKE_RETRY_SECONDS],
    ])('bounds a retry hint of %s to %s', async (hint, expected) => {
      waking({ error: 'model-waking', retryAfterSeconds: hint })

      await expect(askQuestion({ question: 'Why?' })).rejects.toMatchObject({
        retryAfterSeconds: expected,
      })
    })

    it('treats any other 503 as a plain retryable failure', async () => {
      waking({ error: 'rate-limited' })

      await expect(askQuestion({ question: 'Why?' })).rejects.toMatchObject({
        code: 'http_503',
        retryable: true,
      })
    })
  })
})
