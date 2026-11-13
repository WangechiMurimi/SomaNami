import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSupabaseClient } from '../../lib/auth/supabase-client.ts'
import type { Passage } from '../../types/contracts.ts'
import {
  askQuestion,
  ChatError,
  RATE_LIMITED_MESSAGE,
  SESSION_ENDED_MESSAGE,
} from './chat-client.ts'

const reply = { answer: 'Yes.', citations: [], answerable: true }

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

    const passages: Passage[] = [
      {
        documentId: 'doc-1',
        chunkId: 'doc-1:1',
        text: 'x',
        source: { type: 'page', page: 1 },
      },
    ]
    await expect(
      askQuestion({ question: 'Why?', passages, history: [] }),
    ).resolves.toEqual(reply)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/chat')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      question: 'Why?',
      passages,
      history: [],
    })
  })

  it('reports an unreachable service as retryable', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(askQuestion({ question: 'Why?' })).rejects.toMatchObject({
      code: 'offline',
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
      retryable: true,
    })
  })

  it('rejects a reply that breaks the contract', async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => ({ answer: 'Yes.' }),
    }))
    await expect(askQuestion({ question: 'Why?' })).rejects.toBeInstanceOf(
      ChatError,
    )
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

    it('sends no Authorization header without a session', async () => {
      setSupabaseClient(null)
      const fetchMock = mockFetch(async () => ({
        ok: true,
        json: async () => reply,
      }))

      await askQuestion({ question: 'Why?' })

      expect(authorizationOf(fetchMock, 0)).toBeNull()
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
})
