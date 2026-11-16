# ADR 0001: How learners sign up and sign in

- **Status:** Accepted
- **Date:** 2026-11-15
- **Issues:** #114 (accounts), #142 (this revision)

## Context

US-12 asks that each learner's materials and conversations stay private.
#114 added accounts: Supabase Auth with email and password, a Cloudflare
Turnstile check, an age screen before sign-up (month and year), optional
TOTP two-step codes, and generated Privacy and Terms pages. Reviewing it
showed four problems:

- **The age screen comes first.** It's the first thing a new user sees, and it
  asks for a birth date we then have to promise not to keep.
- **Email-only sign-up.** It depends on Supabase email delivery, and every
  learner has to manage another password.
- **Lockouts.** TOTP adds lockouts the team can't support. There is no help
  desk to recover a lost authenticator.
- **Unreviewed legal pages.** Nobody on the team wrote or reviewed the
  Privacy and Terms pages.

Epic #143 also starts storing materials in Supabase, so the database needs a
place for per-user details that users can't tamper with.

## Decision

1. **Google first, email as the fallback.** "Continue with Google" uses
   Supabase OAuth; email and password stay for anyone without Google.
   Google provides its own 2-step checks.
2. **PKCE everywhere.** The browser client uses `flowType: 'pkce'` with
   `detectSessionInUrl: false`. Google, confirmation and recovery links all
   return a one-time `?code=` to one public route, `/auth/callback`, which
   exchanges it and continues to a safe `next` (`safe-next.ts`). Tokens never
   appear in URLs.
3. **Account first, then details.** Creating an account asks for nothing
   else. A details step then asks for a display name (prefilled from Google)
   and an "I'm 13 or older" checkbox. No birth date is asked for or stored.
4. **Details live in `profiles`, not user metadata.** A `profiles` row (RLS:
   owner only) holds `display_name` and `age_13_plus`. Users can edit their
   own Auth metadata through the API, so nothing we rely on goes there.
5. **A profile gate, not a backfill.** `RequireProfile`, inside
   `RequireAuth`, sends a signed-in user without a complete row to
   `/welcome/details`. Existing accounts are caught the same way. The gate is
   skipped while signed in offline, so offline reading (US-07) keeps working.
6. **No TOTP.** Two-step verification, its routes and its account section are
   removed. Password reset by email is the recovery path for email accounts.
7. **The team's own data note.** The generated Privacy and Terms pages are
   replaced by a placeholder "How your data is handled" page (`/your-data`)
   that the team will write.
8. **Wireframes for now.** The final auth design isn't done, so the auth
   screens use plain wireframe styling. They keep their labels, focus
   handling and target sizes.
9. **A narrow CSP.** `connect-src` names only this project's Supabase host.

## Consequences

- **The age check is self-declared.** Under-13s are asked to confirm their
  age, not blocked by a computed date. Kenyan DPA parental consent for 13–17
  is still a follow-up (#114).
- **Links work in one browser only.** Under PKCE, a confirmation or reset link
  works only in the browser that requested it. A confirmation link opened
  elsewhere still confirms the email, and the callback asks the learner to
  sign in. Links sent before this change (implicit flow) no longer sign in.
- **Every origin must be allowed.** Redirect URLs must list each origin,
  including Netlify deploy previews, in Supabase and in the Google client.
  Turnstile doesn't apply to Google sign-in.
- **Accounts with TOTP.** Existing users with a TOTP factor keep it in
  Supabase, but the app no longer asks for it. The server still parses `aal`,
  harmlessly.
- **Moving to another Supabase project** means changing the CSP host in
  `netlify.toml`.

## Alternatives considered

- **Keep TOTP, optional.** Rejected for the support cost; passkeys are a
  possible later replacement.
- **Store the age answer in user metadata.** Rejected because users can edit
  it.
- **Backfill profiles with a migration.** Rejected because there is no
  trustworthy source for existing users' answers; the gate asks once instead.
