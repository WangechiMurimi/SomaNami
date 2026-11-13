// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createAnswererFromEnv } from './answerer-from-env.ts'

describe('createAnswererFromEnv', () => {
  it('returns null without an API key, so the route can say it is not configured', () => {
    expect(createAnswererFromEnv({})).toBeNull()
  })

  it('builds an answerer when an API key is present', () => {
    expect(createAnswererFromEnv({ ANTHROPIC_API_KEY: 'test-key' })).toBeTypeOf(
      'function',
    )
  })
})
