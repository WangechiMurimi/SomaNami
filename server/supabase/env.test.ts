// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { supabaseUrlFromEnv } from './env.ts'

describe('supabaseUrlFromEnv', () => {
  it('prefers SUPABASE_URL', () => {
    expect(
      supabaseUrlFromEnv({
        SUPABASE_URL: ' https://a.test ',
        VITE_SUPABASE_URL: 'https://b.test',
      }),
    ).toBe('https://a.test')
  })

  it('falls back to VITE_SUPABASE_URL when SUPABASE_URL is blank', () => {
    expect(
      supabaseUrlFromEnv({
        SUPABASE_URL: ' ',
        VITE_SUPABASE_URL: 'https://b.test',
      }),
    ).toBe('https://b.test')
  })

  it('is undefined when neither is set', () => {
    expect(supabaseUrlFromEnv({})).toBeUndefined()
  })
})
