import { isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js'
import type { AuthErrorCode } from '../../types/auth.ts'

// Supabase error codes grouped by what we tell the user. Unknown codes fall
// through to `unknown`, so a new server code never leaks its raw message.
const CODE_MAP: Record<string, AuthErrorCode> = {
  invalid_credentials: 'invalid-credentials',
  // Mapped to the same answer as a wrong password, so sign-in never reveals
  // whether an email is registered.
  user_not_found: 'invalid-credentials',
  email_not_confirmed: 'email-not-confirmed',
  weak_password: 'weak-password',
  same_password: 'weak-password',
  captcha_failed: 'captcha-failed',
  // A one-time link that expired, was used already, or was opened in a
  // different browser from the one that started it (PKCE).
  otp_expired: 'link-expired',
  flow_state_expired: 'link-expired',
  flow_state_not_found: 'link-expired',
  bad_code_verifier: 'link-expired',
  pkce_code_verifier_not_found: 'link-expired',
  provider_disabled: 'provider-unavailable',
  oauth_provider_not_supported: 'provider-unavailable',
  over_request_rate_limit: 'rate-limited',
  over_email_send_rate_limit: 'rate-limited',
  user_already_exists: 'email-in-use',
  email_exists: 'email-in-use',
}

const NETWORK_MESSAGE = /fetch|network|load failed/i

/** Turns anything Supabase (or `fetch`) throws into a code the UI can word. */
export function toAuthErrorCode(error: unknown): AuthErrorCode {
  if (isAuthRetryableFetchError(error)) return 'offline'
  // A fetch that never reached the server rejects with a TypeError whose
  // message names the network ("Failed to fetch", "NetworkError…", Safari's
  // "Load failed"). Other TypeErrors are bugs, not connectivity.
  if (error instanceof TypeError && NETWORK_MESSAGE.test(error.message)) {
    return 'offline'
  }
  if (!isAuthError(error)) return 'unknown'
  const mapped = error.code ? CODE_MAP[error.code] : undefined
  if (mapped) return mapped
  if (error.name === 'AuthWeakPasswordError') return 'weak-password'
  if (error.status === 429) return 'rate-limited'
  return 'unknown'
}

const MESSAGES: Record<AuthErrorCode, string> = {
  'invalid-credentials': 'Invalid email or password.',
  'email-not-confirmed':
    'Confirm your email first. We sent you a link when you signed up.',
  'email-in-use': 'We couldn’t create that account. Try signing in instead.',
  'weak-password':
    'Choose a stronger password: at least 10 characters, and not one you’ve used before.',
  'captcha-failed': 'The security check didn’t go through. Please try again.',
  'oauth-cancelled':
    'Google sign-in didn’t finish. Try again, or use your email and password.',
  'link-expired':
    'That link has expired or was opened in a different browser. Sign in again to continue.',
  'provider-unavailable':
    'Google sign-in isn’t available right now. Use your email and password instead.',
  'rate-limited': 'Too many attempts. Wait a few minutes, then try again.',
  offline: 'You’re offline. Reconnect, then try again.',
  'not-configured': 'Sign-in isn’t set up on this copy of SomaNami yet.',
  unknown: 'Something went wrong. Please try again.',
}

/**
 * The failure a provider or Supabase reported in a redirect back to us
 * (`?error=…&error_code=…`), or `null` when there is none. The raw
 * description is never shown, so it can't leak server detail.
 */
export function redirectErrorCode(
  params: URLSearchParams,
): AuthErrorCode | null {
  const error = params.get('error')
  if (!error) return null
  const mapped = CODE_MAP[params.get('error_code') ?? '']
  if (mapped) return mapped
  return error === 'access_denied' ? 'oauth-cancelled' : 'unknown'
}

/** Plain-language copy for an error code; never reveals whether an account exists. */
export function authErrorMessage(code: AuthErrorCode): string {
  return MESSAGES[code]
}
