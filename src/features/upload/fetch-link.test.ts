import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSupabaseClient } from '../../lib/auth/supabase-client.ts'
import { fetchLink, normalizeLink } from './fetch-link.ts'
import { UploadError } from './upload-error.ts'

const session = (token: string | null) => ({
  data: { session: token ? { access_token: token } : null },
  error: null,
})

function fakeSupabase({
  current = 'current' as string | null,
  fresh = 'fresh' as string | null,
} = {}) {
  const auth = {
    getSession: vi.fn().mockResolvedValue(session(current)),
    refreshSession: vi.fn().mockResolvedValue(session(fresh)),
  }
  setSupabaseClient({ auth } as unknown as SupabaseClient)
  return auth
}

const mockFetch = (...responses: Response[]) => {
  const spy = vi.spyOn(globalThis, 'fetch')
  for (const response of responses) spy.mockResolvedValueOnce(response)
  return spy
}

const fail = (error: string, status: number) =>
  Response.json({ error }, { status })

/** Resolves with the `UploadError` the promise rejected with. */
const rejection = (promise: Promise<unknown>): Promise<UploadError> =>
  promise.then(
    () => {
      throw new Error('Expected a rejection')
    },
    (error: unknown) => {
      if (!(error instanceof UploadError)) throw error
      return error
    },
  )

beforeEach(() => {
  fakeSupabase()
})

afterEach(() => {
  vi.restoreAllMocks()
  setSupabaseClient(undefined)
})

describe('normalizeLink', () => {
  it.each([
    ['https://example.org/a', 'https://example.org/a'],
    ['  example.org/paper.pdf ', 'https://example.org/paper.pdf'],
    ['http://example.org', 'http://example.org/'],
  ])('accepts %j', (input, expected) => {
    expect(normalizeLink(input)).toBe(expected)
  })

  it.each([
    '',
    '   ',
    'notes',
    'ftp://example.org/file',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'two words.com',
  ])('rejects %j', (input) => {
    expect(normalizeLink(input)).toBeNull()
  })
})

describe('fetchLink', () => {
  it('posts the url with the session token and returns a named file', async () => {
    const fetchMock = mockFetch(
      new Response('%PDF-1.7', {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition':
            "attachment; filename*=UTF-8''R%C3%A9sum%C3%A9%20notes.pdf",
          'X-Final-Url': 'https://cdn.example.org/notes.pdf',
        },
      }),
    )

    const { file, finalUrl } = await fetchLink('https://example.org/notes')

    expect(fetchMock).toHaveBeenCalledWith('/api/fetch-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer current',
      },
      body: JSON.stringify({ url: 'https://example.org/notes' }),
    })
    expect(file.name).toBe('Résumé notes.pdf')
    expect(file.type).toBe('application/pdf')
    expect(await file.text()).toBe('%PDF-1.7')
    expect(finalUrl).toBe('https://cdn.example.org/notes.pdf')
  })

  it('falls back to the url for the name and final address', async () => {
    mockFetch(new Response('hi', { headers: { 'Content-Type': 'text/plain' } }))
    const { file, finalUrl } = await fetchLink(
      'https://example.org/docs/Intro%20to%20cells.txt',
    )
    expect(file.name).toBe('Intro to cells.txt')
    expect(finalUrl).toBe('https://example.org/docs/Intro%20to%20cells.txt')
  })

  it('ignores a malformed final url header', async () => {
    mockFetch(new Response('hi', { headers: { 'X-Final-Url': 'not a url' } }))
    const { finalUrl } = await fetchLink('https://example.org/a.txt')
    expect(finalUrl).toBe('https://example.org/a.txt')
  })

  it('names a bare domain after its host', async () => {
    mockFetch(new Response('<p>hi</p>'))
    const { file } = await fetchLink('https://example.org/')
    expect(file.name).toBe('example.org')
  })

  it('refreshes an expired token once', async () => {
    const auth = fakeSupabase()
    const fetchMock = mockFetch(
      fail('unauthorized', 401),
      new Response('ok', { headers: { 'Content-Type': 'text/plain' } }),
    )
    await fetchLink('https://example.org/a.txt')
    expect(auth.refreshSession).toHaveBeenCalledOnce()
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('Authorization'),
    ).toBe('Bearer fresh')
  })

  it('reports an ended session without sending anything', async () => {
    fakeSupabase({ current: null })
    const fetchMock = mockFetch()
    const error = await rejection(fetchLink('https://example.org/a'))
    expect(error).toMatchObject({ code: 'unauthorized', retryable: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['too-large', 413, 'validation', false, /over 5 MB.*upload it instead/],
    ['video-not-supported', 400, 'validation', false, /Video links/],
    ['blocked-address', 400, 'validation', false, /public web pages/],
    ['unsupported-type', 415, 'validation', false, /PDFs, Word documents/],
    ['login-or-paywall', 502, 'processing', false, /Paste text instead/],
    ['unreachable', 502, 'processing', true, /couldn’t reach that page/],
    ['timeout', 504, 'processing', true, /too long/],
    ['rate-limited', 429, 'processing', true, /quickly/],
  ] as const)(
    'explains %s',
    async (code, status, stage, retryable, message) => {
      mockFetch(fail(code, status))
      const error = await rejection(fetchLink('https://example.org/a'))
      expect(error).toMatchObject({ code, stage, retryable })
      expect(error.message).toMatch(message)
    },
  )

  it('treats an unreadable error body by its status', async () => {
    mockFetch(new Response('<html>Bad gateway</html>', { status: 429 }))
    expect(await rejection(fetchLink('https://example.org/a'))).toMatchObject({
      code: 'rate-limited',
    })
  })

  it('treats an unknown failure as temporarily unavailable', async () => {
    mockFetch(fail('something-new', 500))
    expect(await rejection(fetchLink('https://example.org/a'))).toMatchObject({
      code: 'not-configured',
      retryable: true,
    })
  })

  it('reports a network failure as retryable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
    expect(await rejection(fetchLink('https://example.org/a'))).toMatchObject({
      code: 'offline',
      retryable: true,
    })
  })
})
