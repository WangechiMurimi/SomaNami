// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FetchLinkErrorCode } from '../../src/types/contracts.ts'
import type { Authenticate } from '../auth/types.ts'
import type { FetchedLink, FetchLinkOutcome } from './fetch-link.ts'
import {
  FETCH_LINK_STATUS,
  handleFetchLink,
  type FetchLinkDependencies,
} from './handle-fetch-link.ts'
import { LINK_MAX_URL_CHARS } from './limits.ts'

const link: FetchedLink = {
  bytes: new Uint8Array([37, 80, 68, 70]),
  contentType: 'application/pdf',
  finalUrl: 'https://example.com/paper.pdf',
  fileName: 'paper.pdf',
}

const allow = () =>
  vi.fn<Authenticate>().mockResolvedValue({
    ok: true,
    user: { id: 'user-1', aal: 'aal1' },
    accessToken: 'token-of-user-1',
  })

const fetched = (outcome: FetchLinkOutcome = { ok: true, link }) =>
  vi.fn<FetchLinkDependencies['fetch']>().mockResolvedValue(outcome)

const deps = (
  overrides: Partial<FetchLinkDependencies> = {},
): FetchLinkDependencies => ({
  authenticate: allow(),
  authorization: 'Bearer token',
  fetch: fetched(),
  ...overrides,
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleFetchLink', () => {
  it('returns the fetched bytes and metadata', async () => {
    const fetch = fetched()

    const result = await handleFetchLink(
      { url: '  https://example.com/paper.pdf ' },
      deps({ fetch }),
    )

    expect(result).toEqual({ status: 200, ...link })
    expect(fetch).toHaveBeenCalledWith('https://example.com/paper.pdf')
  })

  describe('authentication', () => {
    it('passes the Authorization header to the authenticator', async () => {
      const authenticate = allow()

      await handleFetchLink(
        { url: 'https://example.com/' },
        deps({ authenticate, authorization: 'Bearer abc' }),
      )

      expect(authenticate).toHaveBeenCalledWith('Bearer abc')
    })

    it.each(['missing', 'invalid', 'expired'] as const)(
      'answers 401 for a %s session, before fetching',
      async (reason) => {
        const fetch = fetched()

        const result = await handleFetchLink(
          { url: 'https://example.com/' },
          deps({
            authenticate: vi
              .fn<Authenticate>()
              .mockResolvedValue({ ok: false, reason }),
            fetch,
          }),
        )

        expect(result).toEqual({ status: 401, body: { error: 'unauthorized' } })
        expect(fetch).not.toHaveBeenCalled()
      },
    )

    it('answers 503 when sessions cannot be verified', async () => {
      const result = await handleFetchLink(
        { url: 'https://example.com/' },
        deps({
          authenticate: vi
            .fn<Authenticate>()
            .mockResolvedValue({ ok: false, reason: 'not-configured' }),
        }),
      )

      expect(result).toEqual({ status: 503, body: { error: 'not-configured' } })
    })

    it('authenticates before validating the body', async () => {
      const result = await handleFetchLink(
        'not an object',
        deps({
          authenticate: vi
            .fn<Authenticate>()
            .mockResolvedValue({ ok: false, reason: 'missing' }),
        }),
      )

      expect(result.status).toBe(401)
    })
  })

  describe('validation', () => {
    it.each([
      ['no body', undefined],
      ['a string', 'https://example.com/'],
      ['no url', {}],
      ['a number', { url: 42 }],
      ['blank', { url: '   ' }],
      [
        'too long',
        { url: `https://example.com/${'a'.repeat(LINK_MAX_URL_CHARS)}` },
      ],
    ])('refuses %s as invalid-url', async (_label, body) => {
      const fetch = fetched()

      const result = await handleFetchLink(body, deps({ fetch }))

      expect(result).toEqual({ status: 400, body: { error: 'invalid-url' } })
      expect(fetch).not.toHaveBeenCalled()
    })
  })

  describe('fetch failures', () => {
    it.each([
      ['invalid-url', 400],
      ['video-not-supported', 400],
      ['blocked-address', 400],
      ['unsupported-type', 415],
      ['too-large', 413],
      ['timeout', 504],
      ['unreachable', 502],
      ['too-many-redirects', 502],
      ['login-or-paywall', 502],
    ] as const)('maps %s to %i', async (code, status) => {
      const result = await handleFetchLink(
        { url: 'https://example.com/' },
        deps({ fetch: fetched({ ok: false, code }) }),
      )

      expect(result).toEqual({ status, body: { error: code } })
    })

    it('gives every error code a status', () => {
      const codes: FetchLinkErrorCode[] = ['rate-limited', 'unauthorized']

      expect(codes.map((code) => FETCH_LINK_STATUS[code])).toEqual([429, 401])
    })

    it('reports an unexpected error as unreachable and logs only its class', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      const secret = 'https://private.example/medical-notes.pdf'
      const fetch = vi
        .fn<FetchLinkDependencies['fetch']>()
        .mockRejectedValue(new TypeError(`bad ${secret}`))

      const result = await handleFetchLink({ url: secret }, deps({ fetch }))

      expect(result).toEqual({ status: 502, body: { error: 'unreachable' } })
      expect(log).toHaveBeenCalledWith(
        'Link fetch failed unexpectedly',
        'TypeError',
      )
      expect(JSON.stringify(log.mock.calls)).not.toContain('private.example')
    })
  })
})
