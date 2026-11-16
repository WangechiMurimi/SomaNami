/** Why a request carried no usable session. */
export type AuthFailure = 'missing' | 'invalid' | 'expired' | 'not-configured'

/** The caller, as proven by a verified Supabase access token. */
export interface VerifiedUser {
  id: string
  /** `aal2` once a two-step code was entered this session. */
  aal: 'aal1' | 'aal2'
}

export type AuthOutcome =
  | {
      ok: true
      user: VerifiedUser
      /**
       * The verified bearer token, so the server can query Supabase as this
       * user and let RLS scope every row. Never log or persist it.
       */
      accessToken: string
    }
  | { ok: false; reason: AuthFailure }

/**
 * Checks a raw `Authorization` header. Transport-neutral, so Express and the
 * Netlify Function share one implementation, and tests inject a fake.
 */
export type Authenticate = (
  authorization: string | undefined,
) => Promise<AuthOutcome>
