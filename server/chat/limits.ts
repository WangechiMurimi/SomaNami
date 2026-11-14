/**
 * Limits shared by the Express dev server and the Netlify Function, so local
 * development behaves like production.
 */

/** Largest accepted `/api/chat` body, matching Express's `'1mb'`. */
export const CHAT_BODY_LIMIT_BYTES = 1024 * 1024

/** Chat requests allowed per client IP in each window. */
export const CHAT_RATE_LIMIT = 20

/** Length of the rate-limit window. */
export const CHAT_RATE_WINDOW_SECONDS = 60
