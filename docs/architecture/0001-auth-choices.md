# ADR 0001: How learners sign up and sign in

- **Status:** Accepted
- **Date:** 2026-11-15
- **Issues:** #114 (accounts), #142 (this revision)

## Context

#114 added Supabase Auth with email and password, Cloudflare Turnstile, a birth-date screen before sign-up, optional TOTP, and generated Privacy and Terms pages. A review found four problems:

- The first screen asked for a birth date we then had to promise not to keep.
- Email-only sign-up meant another password for every learner.
- No one could support TOTP lockouts.
- No one on the team had written or reviewed the legal pages.

Storing materials in Supabase (#143) also needed a place for per-user details that users can't edit themselves.

## Decision

1. **Google first, email as the fallback.** Supabase OAuth for Google; email and password for everyone else.
2. **PKCE everywhere.** Google, confirmation and recovery links return a one-time `?code=` to `/auth/callback`, which exchanges it and continues to a checked `next` (`safe-next.ts`). Tokens never appear in URLs.
3. **Account first, then details.** Sign-up asks for nothing extra. A details step then asks for a display name and an "I'm 13 or older" checkbox. No birth date is asked for or stored.
4. **Details live in `profiles`, never in Auth user metadata**, which users can edit through the API. RLS lets each user read and write only their own row.
5. **A profile gate, not a backfill.** `RequireProfile` sends a signed-in user without a complete profile to `/welcome/details`. The check is skipped when the session opens offline.
6. **No TOTP.** Password reset by email is the recovery path.
7. **A narrow CSP.** `connect-src` names only this project's Supabase host.

## Consequences

- The age check is self-declared. Parental consent for ages 13–17 (Kenya DPA) is still open (#114).
- A PKCE link works only in the browser that requested it. Opened elsewhere, a confirmation link still confirms the email, and the learner is asked to sign in.
- Every origin, including Netlify deploy previews, must be listed as a redirect URL in Supabase and in the Google client.
- Turnstile doesn't cover Google sign-in.
- Accounts that had TOTP keep the factor in Supabase, but the app never asks for it.
- Moving to another Supabase project means changing the CSP host in `netlify.toml`.

## Alternatives considered

- **Keep TOTP as an option.** Rejected for the support cost; passkeys are a possible later replacement.
- **Store the age answer in user metadata.** Rejected, because users can edit it.
- **Backfill profiles in a migration.** Rejected, because there is no trustworthy source for existing users' answers.

## Later changes

- The generated legal pages were replaced by a "How your data is handled" page (#177), which was itself removed in #204.
- The interim wireframe styling for auth screens was replaced by the design refresh (#176, #177).
