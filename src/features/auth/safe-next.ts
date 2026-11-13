const FALLBACK = '/'

// Pages a visitor is sent *from*, never back *to*: returning to sign-in after
// signing in would loop.
const AUTH_PATHS =
  /^\/(sign-in|sign-up|forgot-password|update-password)(\/|\?|#|$)/

/**
 * The `?next=` target to open after sign-in, or `/` when it isn't a plain
 * same-origin path. Rejects `//host`, `/\host` (browsers treat `\` as `/`),
 * their percent-encoded forms, full URLs and control characters, so `next`
 * can never become an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/')) return FALLBACK
  let decoded: string
  try {
    decoded = decodeURIComponent(next)
  } catch {
    return FALLBACK
  }
  for (const candidate of [next, decoded]) {
    if (/^\/[/\\]/.test(candidate)) return FALLBACK
    // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
    if (/[\u0000-\u001f\u007f\\]/.test(candidate)) return FALLBACK
  }
  if (AUTH_PATHS.test(next)) return FALLBACK
  return next
}

/** `/sign-in`, with `?next=` pointing back at the given location when it isn't home. */
export function signInPathFor(
  pathname: string,
  search: string,
  hash: string,
): string {
  const here = `${pathname}${search}${hash}`
  return here === '/' ? '/sign-in' : `/sign-in?next=${encodeURIComponent(here)}`
}
