import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthWeakPasswordError,
} from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { authErrorMessage, toAuthErrorCode } from './auth-errors.ts'

const api = (code: string, status = 400) =>
  new AuthApiError('server message', status, code)

describe('toAuthErrorCode', () => {
  it.each([
    ['invalid_credentials', 'invalid-credentials'],
    ['user_not_found', 'invalid-credentials'],
    ['email_not_confirmed', 'email-not-confirmed'],
    ['weak_password', 'weak-password'],
    ['same_password', 'weak-password'],
    ['captcha_failed', 'captcha-failed'],
    ['mfa_verification_failed', 'invalid-code'],
    ['mfa_challenge_expired', 'invalid-code'],
    ['over_request_rate_limit', 'rate-limited'],
    ['over_email_send_rate_limit', 'rate-limited'],
    ['user_already_exists', 'email-in-use'],
    ['email_exists', 'email-in-use'],
    ['unexpected_failure', 'unknown'],
  ])('maps %s to %s', (code, expected) => {
    expect(toAuthErrorCode(api(code))).toBe(expected)
  })

  it('treats any 429 as rate limiting', () => {
    expect(toAuthErrorCode(api('something_new', 429))).toBe('rate-limited')
  })

  it('treats network failures as offline', () => {
    expect(
      toAuthErrorCode(new AuthRetryableFetchError('Failed to fetch', 0)),
    ).toBe('offline')
    expect(toAuthErrorCode(new TypeError('Failed to fetch'))).toBe('offline')
  })

  it('recognises the weak-password error class', () => {
    expect(
      toAuthErrorCode(new AuthWeakPasswordError('weak', 422, ['length'])),
    ).toBe('weak-password')
  })

  it('falls back to unknown', () => {
    expect(toAuthErrorCode(new Error('boom'))).toBe('unknown')
    expect(toAuthErrorCode('nope')).toBe('unknown')
  })
})

describe('authErrorMessage', () => {
  it('never says whether an account exists', () => {
    const message = authErrorMessage('invalid-credentials')
    expect(message).toBe('Invalid email or password.')
    expect(message).not.toMatch(/no (such )?(user|account)|not found/i)
  })

  it('has copy for every code', () => {
    for (const code of [
      'invalid-credentials',
      'email-not-confirmed',
      'email-in-use',
      'weak-password',
      'captcha-failed',
      'invalid-code',
      'rate-limited',
      'offline',
      'not-configured',
      'unknown',
    ] as const) {
      expect(authErrorMessage(code)).toMatch(/\S/)
    }
  })
})
