// Whether the learner chose to sign out, as opposed to their session ending.
//
// RequireAuth sends a signed-out visitor to sign-in with `?next=` so they come
// back where they were. After a deliberate sign-out that's wrong: whoever
// signs in next shouldn't land on the previous person's page. The router
// renders navigations as transitions, so a sign-out's own navigate('/sign-in')
// loses to the guard's redirect; the guard reads this instead.
let signingOut = false

/** Notes a deliberate sign-out; call just before signing out. */
export function noteSigningOut(): void {
  signingOut = true
}

/** True from a deliberate sign-out until someone is signed in again. */
export function isSigningOut(): boolean {
  return signingOut
}

/** Clears the note; idempotent, so it is safe to call while rendering. */
export function clearSigningOut(): void {
  signingOut = false
}
