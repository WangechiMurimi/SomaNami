/**
 * Limits for `POST /api/fetch-link`, shared by the Express dev server and the
 * Netlify Function so local development behaves like production.
 */

/**
 * Largest link body we return. Netlify's synchronous Functions answer with at
 * most ~6 MB, so anything bigger is better downloaded and uploaded as a file.
 */
export const LINK_MAX_BYTES = 5 * 1024 * 1024

/**
 * Budget for the whole fetch, redirects included. Netlify stops a Function at
 * ~10 s, and the reply still has to travel back to the browser.
 */
export const LINK_TIMEOUT_MS = 8_000

/** Redirect hops followed before giving up; each hop is re-validated. */
export const LINK_MAX_REDIRECTS = 3

/** Longest accepted URL; real article and PDF links are far shorter. */
export const LINK_MAX_URL_CHARS = 2_048

/** Largest accepted request body: `{ "url": ... }` with room to spare. */
export const LINK_BODY_LIMIT_BYTES = 4 * 1024

/** Link fetches allowed per client IP in each window. */
export const LINK_RATE_LIMIT = 10

/** Length of the rate-limit window. */
export const LINK_RATE_WINDOW_SECONDS = 60
