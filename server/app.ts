import express from 'express'
import type { ErrorRequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { Authenticate } from './auth/types.ts'
import { handleChat } from './chat/handle-chat.ts'
import type { Answerer } from './llm/claude-answerer.ts'

export interface AppOptions {
  /** Answers chat questions; `null` means the server has no Claude credentials. */
  answer?: Answerer | null
  /**
   * Verifies the caller's session. Omitting it refuses every chat, so a
   * forgotten wiring fails closed rather than opening the model to anyone.
   */
  authenticate?: Authenticate
}

/** Chat requests allowed per client IP in each window. */
export const CHAT_RATE_LIMIT = 20
const CHAT_RATE_WINDOW_MS = 60_000

const refuseAll: Authenticate = async () => ({
  ok: false,
  reason: 'not-configured',
})

/**
 * Builds the Express app used for local development and tests. Production runs
 * the same handlers as Netlify Functions (see `netlify/functions/`).
 */
export function createApp({
  answer = null,
  authenticate = refuseAll,
}: AppOptions = {}) {
  const app = express()

  // Limit before parsing, so a flood of large bodies is cut off cheaply. Each
  // app gets its own in-memory counter, which is enough for one dev process;
  // production relies on Netlify's per-IP limit (see netlify/functions/chat.ts).
  app.use(
    '/api/chat',
    rateLimit({
      windowMs: CHAT_RATE_WINDOW_MS,
      limit: CHAT_RATE_LIMIT,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_request, response, _next, options) => {
        response.status(options.statusCode).json({ error: 'rate-limited' })
      },
    }),
  )

  // Questions arrive with client-retrieved passages, which are JSON of a
  // non-trivial size; documents themselves are never uploaded.
  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' })
  })

  app.post('/api/chat', async (request, response) => {
    const result = await handleChat(request.body, {
      answer,
      authenticate,
      authorization: request.get('authorization'),
    })
    response.status(result.status).json(result.body)
  })

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'not-found' })
  })

  app.use(jsonErrors)

  return app
}

// Express answers a malformed JSON body with an HTML error page; the client
// expects JSON from every /api route, matching the Netlify Function.
const jsonErrors: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) return next(error)
  const status = (error as { status?: number }).status ?? 500
  if (status === 400) {
    response.status(400).json({ error: 'invalid-json' })
    return
  }
  console.error('Unhandled API error', error)
  response.status(500).json({ error: 'internal' })
}

export default createApp
