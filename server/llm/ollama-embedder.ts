import process from 'node:process'
import { z } from 'zod'

/**
 * Turns texts into vectors, one per text and in the same order. Rejects with
 * `EmbedderError`. Texts are learner content: never log them.
 */
export type Embedder = (texts: readonly string[]) => Promise<number[][]>

/** Size of every vector; must match `chunks.embedding vector(768)`. */
export const EMBED_DIMENSIONS = 768

/** nomic-embed-text: small enough for a CPU VM, and 768-dimensional. */
export const DEFAULT_EMBED_MODEL = 'nomic-embed-text'

/**
 * Texts per Ollama request. Chunks are at most ~1,200 characters, so 16 is
 * about 5,000 tokens: one CPU-bound call of a few seconds, short enough to
 * retry within a Netlify Function's ~10 s, and big enough that the per-call
 * overhead doesn't dominate.
 */
export const EMBED_BATCH_SIZE = 16

/** Tries per batch, the first included. */
export const EMBED_MAX_ATTEMPTS = 3

/** Wait before the first retry; doubled before each further one. */
export const EMBED_BACKOFF_MS = 250

/** Longest one Ollama call may take before it is aborted and retried. */
export const EMBED_ATTEMPT_TIMEOUT_MS = 6_000

/**
 * Budget for one `embed` call, every batch and retry included. Netlify stops
 * a Function at ~10 s, and the route still has to write the vectors back.
 */
export const EMBED_BUDGET_MS = 7_000

/** Why embedding failed. Only `failed`, `unreachable` and `timeout` were retried. */
export type EmbedderFailure =
  | 'unreachable'
  | 'timeout'
  | 'failed'
  | 'rejected'
  | 'unauthorized'
  | 'rate-limited'
  | 'invalid-response'

/** An embedding failure. Its message never quotes the texts or Ollama's reply. */
export class EmbedderError extends Error {
  readonly kind: EmbedderFailure
  readonly status?: number

  constructor(kind: EmbedderFailure, status?: number) {
    super(
      `Embedding failed: ${kind}${status === undefined ? '' : ` (${status})`}`,
    )
    this.name = 'EmbedderError'
    this.kind = kind
    if (status !== undefined) this.status = status
  }
}

export interface OllamaEmbedderOptions {
  /** e.g. `https://ollama.example.com`; `/api/embed` is appended. */
  baseUrl: string
  /** Sent as `Authorization: Bearer` for the gateway in front of Ollama (#151). */
  apiKey?: string
  model?: string
  batchSize?: number
  maxAttempts?: number
  backoffMs?: number
  attemptTimeoutMs?: number
  budgetMs?: number
  /** Test seams. */
  fetch?: typeof globalThis.fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const embedReply = z.object({
  embeddings: z.array(z.array(z.number().finite()).length(EMBED_DIMENSIONS)),
})

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Builds an `Embedder` over Ollama's `POST /api/embed`. Batches the texts,
 * retries server errors, network failures and timeouts with exponential
 * backoff (never a 4xx, which would fail the same way again), and checks the
 * reply holds one 768-number vector per text.
 */
export function createOllamaEmbedder({
  baseUrl,
  apiKey,
  model = DEFAULT_EMBED_MODEL,
  batchSize = EMBED_BATCH_SIZE,
  maxAttempts = EMBED_MAX_ATTEMPTS,
  backoffMs = EMBED_BACKOFF_MS,
  attemptTimeoutMs = EMBED_ATTEMPT_TIMEOUT_MS,
  budgetMs = EMBED_BUDGET_MS,
  fetch = globalThis.fetch,
  sleep = wait,
  now = Date.now,
}: OllamaEmbedderOptions): Embedder {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/api/embed`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  return async (texts) => {
    const started = now()
    const vectors: number[][] = []
    for (let from = 0; from < texts.length; from += batchSize) {
      const batch = texts.slice(from, from + batchSize)
      vectors.push(...(await embedBatch(batch, started)))
    }
    return vectors
  }

  async function embedBatch(
    input: readonly string[],
    started: number,
  ): Promise<number[][]> {
    const body = JSON.stringify({ model, input, truncate: true })
    let lastFailure: EmbedderError | undefined

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) {
        const delay = backoffMs * 2 ** (attempt - 1)
        // A retry that can't finish inside the budget would only be cut off.
        if (now() - started + delay >= budgetMs) break
        await sleep(delay)
      }
      const remaining = budgetMs - (now() - started)
      if (remaining <= 0) break

      const outcome = await attemptOnce(
        body,
        Math.min(attemptTimeoutMs, remaining),
      )
      if (Array.isArray(outcome)) {
        if (outcome.length !== input.length) {
          throw new EmbedderError('invalid-response')
        }
        return outcome
      }
      if (!isRetryable(outcome)) throw outcome
      lastFailure = outcome
    }
    throw lastFailure ?? new EmbedderError('timeout')
  }

  /** One call to Ollama: its vectors, or the failure (thrown only by callers). */
  async function attemptOnce(
    body: string,
    timeoutMs: number,
  ): Promise<number[][] | EmbedderError> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      let response: Response
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        })
      } catch {
        // Only the kind is kept: a network error can quote the request.
        return new EmbedderError(
          controller.signal.aborted ? 'timeout' : 'unreachable',
        )
      }

      if (!response.ok) {
        // Ollama's error text can echo the input, so the body is discarded.
        await response.body?.cancel().catch(() => undefined)
        return statusFailure(response.status)
      }

      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        return controller.signal.aborted
          ? new EmbedderError('timeout')
          : new EmbedderError('invalid-response')
      }
      const parsed = embedReply.safeParse(payload)
      return parsed.success
        ? parsed.data.embeddings
        : new EmbedderError('invalid-response')
    } finally {
      clearTimeout(timer)
    }
  }
}

function statusFailure(status: number): EmbedderError {
  if (status === 401 || status === 403) {
    return new EmbedderError('unauthorized', status)
  }
  if (status === 429) return new EmbedderError('rate-limited', status)
  if (status >= 500) return new EmbedderError('failed', status)
  return new EmbedderError('rejected', status)
}

const isRetryable = (error: EmbedderError) =>
  error.kind === 'failed' ||
  error.kind === 'unreachable' ||
  error.kind === 'timeout'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Builds the embedder from `OLLAMA_BASE_URL`, `OLLAMA_API_KEY` and
 * `OLLAMA_EMBED_MODEL`, or returns `null` when no usable URL is set, so the
 * route reports not-configured instead of crashing. Plain `http` is accepted
 * only for an Ollama on this machine: learner text must not cross a network
 * unencrypted.
 */
export function createEmbedderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Embedder | null {
  const baseUrl = env.OLLAMA_BASE_URL?.trim()
  if (!baseUrl) return null

  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    console.error('OLLAMA_BASE_URL is not a valid URL; embeddings are disabled')
    return null
  }
  const local = url.protocol === 'http:' && LOOPBACK.has(url.hostname)
  if (url.protocol !== 'https:' && !local) {
    console.error(
      'OLLAMA_BASE_URL must use https unless it is on this machine; embeddings are disabled',
    )
    return null
  }

  return createOllamaEmbedder({
    baseUrl,
    apiKey: env.OLLAMA_API_KEY?.trim() || undefined,
    model: env.OLLAMA_EMBED_MODEL?.trim() || undefined,
  })
}
