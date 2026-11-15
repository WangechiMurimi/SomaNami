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
      // The token itself is never logged, only that keys were unreachable.
      if (error instanceof errors.JWTExpired) return fail('expired')
      if (isKeySetUnavailable(error)) {
        console.error('Could not load the Supabase signing keys')
        return fail('not-configured')
      }
      return fail('invalid')
    }
  }
}

/**
 * True when the signing keys couldn't be fetched (timeout, network, bad
 * response), which is the server's problem, not the caller's. Answering 401
 * here would tell every signed-in user their session ended.
 */
function isKeySetUnavailable(error: unknown): boolean {
  if (error instanceof errors.JWKSTimeout) return true
  // Fetch failures surface as plain errors; jose's own non-200 and bad-JSON
  // responses use the base class. Every token problem uses a subclass.
  if (!(error instanceof errors.JOSEError)) return true
  return error.constructor === errors.JOSEError
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
 * Builds the authenticator from `SUPABASE_URL`, falling back to the browser's
 * `VITE_SUPABASE_URL` (the same public project URL) so one setting suffices.
 * Without either every request is refused as `not-configured`, so a
 * misconfigured deploy fails closed.
 */
export function createAuthenticatorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Authenticate {
  const supabaseUrl = env.SUPABASE_URL?.trim() || env.VITE_SUPABASE_URL?.trim()
  return supabaseUrl ? createAuthenticator({ supabaseUrl }) : notConfigured
}
