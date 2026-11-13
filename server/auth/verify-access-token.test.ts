// @vitest-environment node
import {
  createLocalJWKSet,
  errors,
  exportJWK,
  generateKeyPair,
  SignJWT,
  UnsecuredJWT,
} from 'jose'
import type { CryptoKey, JWTPayload } from 'jose'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createAuthenticator,
  createAuthenticatorFromEnv,
} from './verify-access-token.ts'

const SUPABASE_URL = 'https://project-ref.supabase.co'
const ISSUER = `${SUPABASE_URL}/auth/v1`
const KID = 'test-key'

let privateKey: CryptoKey
let otherPrivateKey: CryptoKey
let authenticate: ReturnType<typeof createAuthenticator>

beforeAll(async () => {
  const pair = await generateKeyPair('ES256')
  privateKey = pair.privateKey
  otherPrivateKey = (await generateKeyPair('ES256')).privateKey
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'ES256' }
  authenticate = createAuthenticator({
    supabaseUrl: SUPABASE_URL,
    keySet: createLocalJWKSet({ keys: [jwk] }),
  })
})

/** Signs a Supabase-shaped access token; overrides tweak one claim at a time. */
function sign(
  claims: JWTPayload = {},
  {
    key = privateKey,
    issuer = ISSUER,
    audience = 'authenticated',
    expiresIn = '1h' as string | number,
  } = {},
) {
  return new SignJWT({
    sub: 'user-123',
    role: 'authenticated',
    aal: 'aal1',
    ...claims,
  })
    .setProtectedHeader({ alg: 'ES256', kid: KID, typ: 'JWT' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key)
}

describe('createAuthenticator', () => {
  it('accepts a valid token and returns the user id and aal', async () => {
    const token = await sign()

    await expect(authenticate(`Bearer ${token}`)).resolves.toEqual({
      ok: true,
      user: { id: 'user-123', aal: 'aal1' },
    })
  })

  it('reports aal2 once the user completed a second factor', async () => {
    const token = await sign({ aal: 'aal2' })

    await expect(authenticate(`Bearer ${token}`)).resolves.toEqual({
      ok: true,
      user: { id: 'user-123', aal: 'aal2' },
    })
  })

  it('treats a token without an aal claim as aal1', async () => {
    const token = await sign({ aal: undefined })

    await expect(authenticate(`Bearer ${token}`)).resolves.toMatchObject({
      ok: true,
      user: { aal: 'aal1' },
    })
  })

  it('accepts the scheme in any case', async () => {
    const token = await sign()

    await expect(authenticate(`bearer ${token}`)).resolves.toMatchObject({
      ok: true,
    })
  })

  it.each([
    ['no header', undefined],
    ['an empty header', ''],
    ['another scheme', 'Basic dXNlcjpwYXNz'],
    ['a bare token', 'eyJhbGciOiJFUzI1NiJ9.e30.sig'],
    ['an empty bearer', 'Bearer '],
    ['two tokens', 'Bearer a.b.c d.e.f'],
  ])('reports %s as missing', async (_label, header) => {
    await expect(authenticate(header)).resolves.toEqual({
      ok: false,
      reason: 'missing',
    })
  })

  it('reports an expired token as expired', async () => {
    const token = await sign(
      {},
      { expiresIn: Math.floor(Date.now() / 1000) - 60 },
    )

    await expect(authenticate(`Bearer ${token}`)).resolves.toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it.each([
    [
      'the wrong issuer',
      () => sign({}, { issuer: 'https://evil.example/auth/v1' }),
    ],
    ['the wrong audience', () => sign({}, { audience: 'anon' })],
    ['a signature from another key', () => sign({}, { key: otherPrivateKey })],
    [
      'the none algorithm',
      async () =>
        new UnsecuredJWT({ aal: 'aal1' })
          .setSubject('user-123')
          .setIssuer(ISSUER)
          .setAudience('authenticated')
          .setExpirationTime('1h')
          .encode(),
    ],
    ['a token that is not a JWT', async () => 'not-a-jwt'],
    ['a token without a subject', () => sign({ sub: '' })],
    ['an unknown aal', () => sign({ aal: 'aal9' })],
  ])('reports %s as invalid', async (_label, makeToken) => {
    const token = await makeToken()

    await expect(authenticate(`Bearer ${token}`)).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('reports a tampered payload as invalid', async () => {
    const [header, , signature] = (await sign()).split('.')
    const forged = Buffer.from(
      JSON.stringify({
        sub: 'someone-else',
        iss: ISSUER,
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url')

    await expect(
      authenticate(`Bearer ${header}.${forged}.${signature}`),
    ).resolves.toEqual({ ok: false, reason: 'invalid' })
  })

  it('tolerates a trailing slash on the project URL', async () => {
    const pair = await generateKeyPair('ES256')
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'ES256' }
    const check = createAuthenticator({
      supabaseUrl: `${SUPABASE_URL}/`,
      keySet: createLocalJWKSet({ keys: [jwk] }),
    })
    const token = await sign({}, { key: pair.privateKey })

    await expect(check(`Bearer ${token}`)).resolves.toMatchObject({ ok: true })
  })
})

describe('when the signing keys are unreachable', () => {
  it.each([
    ['a JWKS timeout', new errors.JWKSTimeout()],
    ['a network failure', new TypeError('fetch failed')],
    ['a non-200 JWKS response', new errors.JOSEError('Expected 200 OK')],
  ])(
    'reports %s as a server problem, not a bad session',
    async (_label, error) => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const check = createAuthenticator({
        supabaseUrl: SUPABASE_URL,
        keySet: async () => {
          throw error
        },
      })

      await expect(check(`Bearer ${await sign()}`)).resolves.toEqual({
        ok: false,
        reason: 'not-configured',
      })
      vi.restoreAllMocks()
    },
  )

  it('still reports a token signed by an unknown key as invalid', async () => {
    const check = createAuthenticator({
      supabaseUrl: SUPABASE_URL,
      keySet: createLocalJWKSet({ keys: [] }),
    })

    await expect(check(`Bearer ${await sign()}`)).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    })
  })
})

describe('createAuthenticatorFromEnv', () => {
  it('reports every request as not configured without SUPABASE_URL', async () => {
    const check = createAuthenticatorFromEnv({})

    await expect(check('Bearer anything')).resolves.toEqual({
      ok: false,
      reason: 'not-configured',
    })
    await expect(check(undefined)).resolves.toEqual({
      ok: false,
      reason: 'not-configured',
    })
  })

  it('falls back to the public VITE_SUPABASE_URL', async () => {
    const check = createAuthenticatorFromEnv({
      VITE_SUPABASE_URL: SUPABASE_URL,
    })

    await expect(check(undefined)).resolves.toEqual({
      ok: false,
      reason: 'missing',
    })
  })

  it('builds a verifier when SUPABASE_URL is set', async () => {
    const check = createAuthenticatorFromEnv({ SUPABASE_URL })

    // No network: a missing header fails before any key lookup.
    await expect(check(undefined)).resolves.toEqual({
      ok: false,
      reason: 'missing',
    })
  })
})
