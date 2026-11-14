/**
 * Auth contracts shared by every auth workstream (#114). Change them only
 * through the coordinator, so parallel branches keep compiling together.
 */

/**
 * Where the current visitor stands.
 * - `signed-in-offline`: a saved session exists but can't be refreshed while
 *   offline; the user keeps reading their local materials (US-07).
 * - `needs-mfa`: the password was accepted, but the account has a verified
 *   authenticator, so a code is required before the app opens.
 */
export type AuthStatus =
  'loading' | 'signed-out' | 'needs-mfa' | 'signed-in' | 'signed-in-offline'

export interface AuthUser {
  /** Supabase user id (UUID); also names the user's local store. */
  id: string
  email: string
}

/** Failure reasons the UI can word for people; never reveals whether an account exists. */
export type AuthErrorCode =
  | 'invalid-credentials'
  | 'email-not-confirmed'
  | 'email-in-use'
  | 'weak-password'
  | 'captcha-failed'
  | 'invalid-code'
  | 'rate-limited'
  | 'offline'
  | 'not-configured'
  | 'unknown'

export type AuthResult = { ok: true } | { ok: false; error: AuthErrorCode }

export interface SignInInput {
  email: string
  password: string
  captchaToken: string
}

export interface SignUpInput extends SignInInput {
  /** ISO time the user accepted the Terms and Privacy Notice. */
  consentedAt: string
  // The age screen runs before this call; only its outcome is ever stored
  // (as `age_13_plus: true`), never the birth date.
}

export interface PasswordResetInput {
  email: string
  captchaToken: string
}

export interface MfaFactor {
  id: string
  friendlyName: string | null
  status: 'verified' | 'unverified'
}

/** What the enrol screen needs to show the user. */
export interface TotpEnrollment {
  factorId: string
  /** SVG data URI of the QR code. */
  qrCode: string
  /** The same secret as text, for typing into an authenticator by hand. */
  secret: string
}

export interface MfaApi {
  listFactors(): Promise<MfaFactor[]>
  enrollTotp(friendlyName?: string): Promise<TotpEnrollment>
  /** Challenges and verifies in one step; also completes a `needs-mfa` sign-in. */
  verify(factorId: string, code: string): Promise<AuthResult>
  unenroll(factorId: string): Promise<AuthResult>
}

/** What `useAuth()` returns. */
export interface AuthContextValue {
  status: AuthStatus
  /** Set for `needs-mfa`, `signed-in` and `signed-in-offline`. */
  user: AuthUser | null
  signIn(input: SignInInput): Promise<AuthResult>
  signUp(input: SignUpInput): Promise<AuthResult>
  /** `global` signs out every device; `local` only this one. */
  signOut(options?: { scope?: 'local' | 'global' }): Promise<void>
  requestPasswordReset(input: PasswordResetInput): Promise<AuthResult>
  updatePassword(password: string): Promise<AuthResult>
  mfa: MfaApi
}
