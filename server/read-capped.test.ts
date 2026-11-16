// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readCapped, readJsonBody } from './read-capped.ts'

const post = (body?: string) =>
  new Request('https://example.test/', { method: 'POST', body })

describe('readCapped', () => {
  it('reads a body within the limit', async () => {
    expect(await readCapped(post('héllo'), 6)).toBe('héllo')
  })

  it('returns an empty string when there is no body', async () => {
    expect(await readCapped(post(), 10)).toBe('')
  })

  it('returns null once the body passes the limit in bytes', async () => {
    // Five characters, six bytes.
    expect(await readCapped(post('héllo'), 5)).toBeNull()
  })
})

describe('readJsonBody', () => {
  it('parses a JSON body within the limit', async () => {
    expect(await readJsonBody(post('{"a":1}'), 100)).toEqual({
      ok: true,
      body: { a: 1 },
    })
  })

  it('refuses a declared length over the limit without reading', async () => {
    const request = new Request('https://example.test/', {
      method: 'POST',
      body: '{}',
      headers: { 'content-length': '101' },
    })
    expect(await readJsonBody(request, 100)).toEqual({
      ok: false,
      problem: 'too-large',
    })
  })

  it('refuses a body that passes the limit as it is read', async () => {
    expect(await readJsonBody(post('"héllo"'), 7)).toEqual({
      ok: false,
      problem: 'too-large',
    })
  })

  it('reports a body that is not JSON', async () => {
    expect(await readJsonBody(post('not json'), 100)).toEqual({
      ok: false,
      problem: 'invalid-json',
    })
  })
})
