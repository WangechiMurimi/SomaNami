/**
 * Auth contracts shared by every auth workstream (#114). Change them only
 * through the coordinator, so parallel branches keep compiling together.
 */

/**
 * Where the current visitor stands.
 * - `signed-in-offline`: a saved session exists but can't be refreshed while
 *   offline; the user keeps reading their local materials (US-07).
 */
export type AuthStatus =
  'loading' | 'signed-out' | 'signed-in' | 'signed-in-offline'

export interface AuthUser {
  /** Supabase user id (UUID); also names the user's local store. */
  id: string
  email: string
  /**
   * The name Google gave, used only to prefill the details step. Users can
   * edit it in their metadata, so it is never trusted for anything else.
   */
  name?: string
}

/** Failure reasons the UI can word for people; never reveals whether an account exists. */
export type AuthErrorCode =
  | 'invalid-credentials'
  | 'email-not-confirmed'
  | 'email-in-use'
  | 'weak-password'
  | 'captcha-failed'
  | 'oauth-cancelled'
  | 'link-expired'
  | 'provider-unavailable'
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

/**
 * Creating an account asks for nothing else: the name and the 13-or-older
 * answer come afterwards, in `profiles`, never in user metadata (users can
 * edit their own metadata).
 */
export type SignUpInput = SignInInput

export interface PasswordResetInput {
  email: string
  captchaToken: string
}

/** What `useAuth()` returns. */
export interface AuthContextValue {
  status: AuthStatus
  /** Set for `signed-in` and `signed-in-offline`. */
  user: AuthUser | null
  signIn(input: SignInInput): Promise<AuthResult>
  signUp(input: SignUpInput): Promise<AuthResult>
  /**
   * Sends the browser to Google; it comes back to /auth/callback and then to
   * `next`. Resolves only if leaving failed.
   */
  signInWithGoogle(next?: string): Promise<AuthResult>
  /** Finishes a Google, confirmation or recovery link by exchanging its one-time code. */
  exchangeCode(code: string): Promise<AuthResult>
  /** `global` signs out every device; `local` only this one. */
  signOut(options?: { scope?: 'local' | 'global' }): Promise<void>
  requestPasswordReset(input: PasswordResetInput): Promise<AuthResult>
  updatePassword(password: string): Promise<AuthResult>
}
