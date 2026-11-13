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
  mfa_verification_failed: 'invalid-code',
  mfa_verification_rejected: 'invalid-code',
  mfa_challenge_expired: 'invalid-code',
  over_request_rate_limit: 'rate-limited',
  over_email_send_rate_limit: 'rate-limited',
  user_already_exists: 'email-in-use',
  email_exists: 'email-in-use',
}

/** Turns anything Supabase (or `fetch`) throws into a code the UI can word. */
export function toAuthErrorCode(error: unknown): AuthErrorCode {
  if (isAuthRetryableFetchError(error)) return 'offline'
  // A fetch that never reached the server rejects with a TypeError.
  if (error instanceof TypeError) return 'offline'
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
  'invalid-code': 'That code didn’t work. Check your app and try again.',
  'rate-limited': 'Too many attempts. Wait a few minutes, then try again.',
  offline: 'You’re offline. Reconnect, then try again.',
  'not-configured': 'Sign-in isn’t set up on this copy of SomaNami yet.',
  unknown: 'Something went wrong. Please try again.',
}

/** Plain-language copy for an error code; never reveals whether an account exists. */
export function authErrorMessage(code: AuthErrorCode): string {
  return MESSAGES[code]
}
