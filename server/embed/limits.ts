/**
 * Limits for `POST /api/embed`, shared by the Express dev server and the
 * Netlify Function so local development behaves like production.
 */

/**
 * Chunks embedded per request. Two Ollama batches (see `EMBED_BATCH_SIZE`)
 * fit inside a Netlify Function's ~10 s with room for a retry and the writes
 * back to Supabase; the client calls again until the reply says `done`.
 */
export const EMBED_CHUNKS_PER_REQUEST = 32

/**
 * Longest chunk text sent to the model. The app's chunks are far shorter, but
 * rows are written by the learner's devices, so a bigger one is cut rather
 * than sent whole. nomic-embed-text reads ~2,048 tokens, about this much.
 */
export const EMBED_MAX_TEXT_CHARS = 8_000

/** Largest accepted request body; the body is `{}`. */
export const EMBED_BODY_LIMIT_BYTES = 1024

/**
 * Embed requests allowed per client IP in each window: 960 chunks a minute,
 * hundreds of pages, well above one learner's uploads.
 */
export const EMBED_RATE_LIMIT = 30

/** Length of the rate-limit window. */
export const EMBED_RATE_WINDOW_SECONDS = 60
