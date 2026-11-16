// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { allowUser, requestsTo, signedInUser } from './fixtures.ts'

describe('server test fixtures', () => {
  it('signs every request in as user-1 with the given token', async () => {
    expect(await allowUser('abc')('Bearer x')).toEqual({
      ok: true,
      user: { id: 'user-1', aal: 'aal1' },
      accessToken: 'abc',
    })
    expect(signedInUser()).toMatchObject({ accessToken: 'token-of-user-1' })
  })

  it('builds JSON and streamed POSTs to one address', async () => {
    const { post, streamed } = requestsTo('https://example.test/api/chat')

    const json = post('{"a":1}', { Authorization: 'Bearer t' })
    expect(json.method).toBe('POST')
    expect(json.url).toBe('https://example.test/api/chat')
    expect(json.headers.get('Content-Type')).toBe('application/json')
    expect(json.headers.get('Authorization')).toBe('Bearer t')
    expect(await json.text()).toBe('{"a":1}')

    const chunked = streamed('hello')
    expect(chunked.headers.get('Content-Length')).toBeNull()
    expect(await chunked.text()).toBe('hello')
  })
})
