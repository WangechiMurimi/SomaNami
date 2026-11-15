// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  createUserClient,
  isSecretKey,
  supabaseConfigFromEnv,
} from './user-client.ts'

/** A JWT-shaped legacy key carrying `role`; the signature is irrelevant here. */
const legacyKey = (role: string) =>
  [
    Buffer.from('{"alg":"HS256"}').toString('base64url'),
    Buffer.from(JSON.stringify({ role })).toString('base64url'),
    'signature',
  ].join('.')

describe('supabaseConfigFromEnv', () => {
  it('prefers the server names', () => {
    expect(
      supabaseConfigFromEnv({
        SUPABASE_URL: 'https://server.supabase.test',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_server',
        VITE_SUPABASE_URL: 'https://browser.supabase.test',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_browser',
      }),
    ).toEqual({
      url: 'https://server.supabase.test',
      publishableKey: 'sb_publishable_server',
    })
  })

  it('falls back to the browser names, so one pair of settings is enough', () => {
    expect(
      supabaseConfigFromEnv({
        VITE_SUPABASE_URL: ' https://browser.supabase.test ',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_browser',
      }),
    ).toEqual({
      url: 'https://browser.supabase.test',
      publishableKey: 'sb_publishable_browser',
    })
  })

  it.each([
    ['nothing', {}],
    ['no key', { SUPABASE_URL: 'https://x.supabase.test' }],
    ['no URL', { SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }],
  ])('is null with %s set', (_label, env) => {
    expect(supabaseConfigFromEnv(env)).toBeNull()
  })

  it.each([
    ['a secret key', 'sb_secret_abc'],
    ['a legacy service-role key', legacyKey('service_role')],
  ])('refuses %s, which would bypass RLS', (_label, key) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(
      supabaseConfigFromEnv({
        SUPABASE_URL: 'https://x.supabase.test',
        SUPABASE_PUBLISHABLE_KEY: key,
      }),
    ).toBeNull()
    expect(JSON.stringify(log.mock.calls)).not.toContain(key)
    log.mockRestore()
  })
})

describe('isSecretKey', () => {
  it.each([
    ['a publishable key', 'sb_publishable_abc', false],
    ['a legacy anon key', legacyKey('anon'), false],
    ['a secret key', 'sb_secret_abc', true],
    ['a legacy service-role key', legacyKey('service_role'), true],
    ['dotted junk', 'a.%%%.c', false],
  ])('treats %s correctly', (_label, key, expected) => {
    expect(isSecretKey(key)).toBe(expected)
  })
})

describe('createUserClient', () => {
  it("sends the user's token and the publishable key, and stores nothing", async () => {
    const fetch = vi.fn(async () => Response.json([]))
    const client = createUserClient(
      { url: 'https://x.supabase.test', publishableKey: 'sb_publishable_x' },
      'user-token',
      { fetch },
    )

    await client.from('documents').select('id')

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get('authorization')).toBe('Bearer user-token')
    expect(headers.get('apikey')).toBe('sb_publishable_x')
  })
})
