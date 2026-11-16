import type { EmbedReply } from '../../types/contracts.ts'
import { requestEmbeddings } from './request-embeddings.ts'

/** Embeds the learner's new chunks in the background, after they sync. */
export interface EmbedScheduler {
  /** Notes that new chunks may be waiting, e.g. after this device pushed. */
  markNeeded(): void
  /**
   * Embeds every waiting chunk if needed and not backing off; joins a run in
   * progress. Never rejects, so callers can fire and forget.
   */
  kick(): Promise<void>
}

export interface EmbedSchedulerOptions {
  request?: () => Promise<EmbedReply>
  /** Requests per run; a bigger backlog resumes on the next kick. */
  maxRounds?: number
  /** Wait after the first failure; doubled after each further one. */
  retryAfterMs?: number
  maxRetryAfterMs?: number
  now?: () => number
}

/** About 1,600 chunks (50 × 32) per run before yielding to the next kick. */
const MAX_ROUNDS = 50
const RETRY_AFTER_MS = 60_000
const MAX_RETRY_AFTER_MS = 30 * 60_000

/**
 * Builds a scheduler that pages through `POST /api/embed` until the server
 * reports `done`. A failure (offline, signed out, Ollama down) leaves the
 * chunks waiting in the database, so a later kick picks them up after an
 * exponential backoff. Starts as needed, so chunks a previous session left
 * without vectors are embedded too.
 */
export function createEmbedScheduler({
  request = () => requestEmbeddings(),
  maxRounds = MAX_ROUNDS,
  retryAfterMs = RETRY_AFTER_MS,
  maxRetryAfterMs = MAX_RETRY_AFTER_MS,
  now = Date.now,
}: EmbedSchedulerOptions = {}): EmbedScheduler {
  let needed = true
  let failures = 0
  let retryAt = 0
  let running: Promise<void> | null = null

  const backOff = () => {
    needed = true
    failures += 1
    retryAt =
      now() + Math.min(retryAfterMs * 2 ** (failures - 1), maxRetryAfterMs)
  }

  async function run(): Promise<void> {
    needed = false
    try {
      for (let round = 0; round < maxRounds; round += 1) {
        const reply = await request()
        if (reply.done) {
          failures = 0
          return
        }
        // Not done, yet nothing embedded: asking again at once would loop.
        if (reply.embedded === 0) {
          backOff()
          return
        }
      }
      // A big backlog: the rest waits for the next kick.
      failures = 0
      needed = true
    } catch {
      // Nothing is logged: the reason is an error code at most, and the
      // chunks stay waiting in the database for the retry.
      backOff()
    }
  }

  return {
    markNeeded() {
      needed = true
    },
    kick() {
      if (running) return running
      if (!needed || now() < retryAt) return Promise.resolve()
      running = run().finally(() => {
        running = null
      })
      return running
    },
  }
}
