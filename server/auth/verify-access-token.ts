import process from 'node:process'
import { createRemoteJWKSet, errors, jwtVerify } from 'jose'
import type { JWTVerifyGetKey } from 'jose'
import type { Authenticate, AuthOutcome, VerifiedUser } from './types.ts'

export interface AuthenticatorOptions {
  /** The Supabase project URL, e.g. `https://<ref>.supabase.co`. */
  supabaseUrl: string
  /** Where signing keys come from; tests pass a local set instead of the network. */
  keySet?: JWTVerifyGetKey
}

// Supabase signs with asymmetric keys (ES256 by default, RS256 optionally).
// Pinning these rejects `none` and blocks HS256 key-confusion tricks.
const ALGORITHMS = ['ES256', 'RS256']

const AUDIENCE = 'authenticated'

const BEARER = /^Bearer ([^\s]+)$/i

const fail = (reason: Extract<AuthOutcome, { ok: false }>['reason']) =>
  ({ ok: false, reason }) as const

/**
 * Builds an `Authenticate` that verifies Supabase access tokens locally against
 * the project's published signing keys (JWKS), so no request reaches Supabase.
 */
export function createAuthenticator({
  supabaseUrl,
  keySet,
}: AuthenticatorOptions): Authenticate {
  const base = supabaseUrl.replace(/\/+$/, '')
  const issuer = `${base}/auth/v1`
  // jose caches the fetched keys (10 minutes by default), which stays within
  // Supabase's advice to cache JWKS for no longer than 20 minutes.
  const keys =
    keySet ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))

  return async (authorization) => {
    const token = BEARER.exec(authorization?.trim() ?? '')?.[1]
    if (!token) return fail('missing')

    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer,
        audience: AUDIENCE,
        algorithms: ALGORITHMS,
        requiredClaims: ['exp', 'sub'],
      })
      const user = toUser(payload.sub, payload.aal)
      return user ? { ok: true, user } : fail('invalid')
    } catch (error) {
      // The client refreshes and retries on `expired`; everything else is a
      // forged, foreign or broken token. The token itself is never logged.
      return error instanceof errors.JWTExpired
        ? fail('expired')
        : fail('invalid')
    }
  }
}

function toUser(sub: unknown, aal: unknown): VerifiedUser | null {
  if (typeof sub !== 'string' || sub === '') return null
  // Tokens from before MFA existed carry no `aal`; they are single-factor.
  if (aal === undefined || aal === 'aal1') return { id: sub, aal: 'aal1' }
  if (aal === 'aal2') return { id: sub, aal: 'aal2' }
  return null
}

const notConfigured: Authenticate = async () => fail('not-configured')

/**
 * Builds the authenticator from `SUPABASE_URL` (server-side only; the browser
 * reads `VITE_SUPABASE_URL`). Without it every request is refused as
 * `not-configured`, so a misconfigured deploy fails closed.
 */
export function createAuthenticatorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Authenticate {
  const supabaseUrl = env.SUPABASE_URL?.trim()
  return supabaseUrl ? createAuthenticator({ supabaseUrl }) : notConfigured
}
