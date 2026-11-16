// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readCapped } from './read-capped.ts'

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
