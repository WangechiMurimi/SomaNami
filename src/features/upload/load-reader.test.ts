import { describe, expect, it } from 'vitest'
import { loadReader } from './load-reader.ts'
import { UploadError } from './upload-error.ts'

describe('loadReader', () => {
  it('returns the loaded module', async () => {
    const mod = { parse: () => {} }
    expect(await loadReader(async () => mod)).toBe(mod)
  })

  it('reports a failed chunk download as retryable, not as a bad file', async () => {
    const offline = new TypeError('Failed to fetch dynamically imported module')

    const error = await loadReader(() => Promise.reject(offline)).catch(
      (e) => e,
    )

    expect(error).toBeInstanceOf(UploadError)
    expect(error).toMatchObject({
      code: 'reader-unavailable',
      stage: 'processing',
      retryable: true,
    })
    expect(error.message).toMatch(/Check your connection/)
    expect(error.cause).toBe(offline)
  })
})
