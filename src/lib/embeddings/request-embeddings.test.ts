import { describe, expect, it, vi } from 'vitest'
import { EmbedRequestError, requestEmbeddings } from './request-embeddings.ts'

const reply = (body: unknown, status = 200) => Response.json(body, { status })

const tokens = (...values: (string | null)[]) => {
  const getToken =
    vi.fn<(options?: { refresh?: boolean }) => Promise<string | null>>()
  for (const value of values) getToken.mockResolvedValueOnce(value)
  return getToken
}

describe('requestEmbeddings', () => {
  it('posts an empty body with the session token and returns the reply', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(reply({ embedded: 32, done: false }))

    const result = await requestEmbeddings({
      fetch,
      getToken: tokens('token-1'),
    })

    expect(result).toEqual({ embedded: 32, done: false })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('/api/embed')
    expect(init?.method).toBe('POST')
    // The browser sends no chunk text; the server reads it from Supabase.
    expect(init?.body).toBe('{}')
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer token-1',
    )
  })

  it('does not call the server without a session', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()

    await expect(
      requestEmbeddings({ fetch, getToken: tokens(null) }),
    ).rejects.toMatchObject({ code: 'unauthenticated' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refreshes the token once after a 401', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(reply({ error: 'unauthenticated' }, 401))
      .mockResolvedValueOnce(reply({ embedded: 1, done: true }))
    const getToken = tokens('old', 'fresh')

    const result = await requestEmbeddings({ fetch, getToken })

    expect(result).toEqual({ embedded: 1, done: true })
    expect(getToken).toHaveBeenLastCalledWith({ refresh: true })
    expect(
      new Headers(fetch.mock.calls[1]![1]?.headers).get('authorization'),
    ).toBe('Bearer fresh')
  })

  it('gives up after a second 401', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(reply({ error: 'unauthenticated' }, 401))

    await expect(
      requestEmbeddings({ fetch, getToken: tokens('old', 'fresh') }),
    ).rejects.toMatchObject({ code: 'unauthenticated' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it.each([
    [503, 'not-configured'],
    [502, 'upstream-failed'],
    [429, 'rate-limited'],
  ])('reports a %i as %s', async (status, error) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(reply({ error }, status))

    const failure = requestEmbeddings({ fetch, getToken: tokens('t') })

    await expect(failure).rejects.toBeInstanceOf(EmbedRequestError)
    await expect(failure).rejects.toMatchObject({ code: error, status })
  })

  it('reports a status without a JSON body by its number', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('Too Many Requests', { status: 429 }))

    await expect(
      requestEmbeddings({ fetch, getToken: tokens('t') }),
    ).rejects.toMatchObject({ code: 'http_429', status: 429 })
  })

  it('reports a network failure as offline', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(
      requestEmbeddings({ fetch, getToken: tokens('t') }),
    ).rejects.toMatchObject({ code: 'offline' })
  })

  it.each([
    ['not JSON', new Response('<html>')],
    ['missing done', reply({ embedded: 1 })],
    ['negative count', reply({ embedded: -1, done: true })],
  ])('rejects a malformed reply: %s', async (_name, response) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response)

    await expect(
      requestEmbeddings({ fetch, getToken: tokens('t') }),
    ).rejects.toMatchObject({ code: 'malformed' })
  })
})
