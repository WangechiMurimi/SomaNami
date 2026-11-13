import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getSupabaseClient,
  readSupabaseConfig,
  setSupabaseClient,
} from './supabase-client.ts'

afterEach(() => {
  vi.unstubAllEnvs()
  setSupabaseClient(undefined)
})

describe('readSupabaseConfig', () => {
  it('returns the URL and publishable key when both are set', () => {
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: ' https://demo.supabase.co ',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_123',
      }),
    ).toEqual({
      url: 'https://demo.supabase.co',
      publishableKey: 'sb_publishable_123',
    })
  })

  it.each([
    [{ VITE_SUPABASE_URL: 'https://demo.supabase.co' }],
    [{ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_123' }],
    [{ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_PUBLISHABLE_KEY: 'key' }],
  ])('returns null when a setting is missing or blank: %o', (env) => {
    expect(readSupabaseConfig(env)).toBeNull()
  })
})

describe('getSupabaseClient', () => {
  it('is null when the project is not configured', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
    expect(getSupabaseClient()).toBeNull()
  })

  it('builds one client and reuses it', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://demo.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_123')
    const first = getSupabaseClient()
    expect(first).not.toBeNull()
    expect(getSupabaseClient()).toBe(first)
  })
})
