import express from 'express'
import type { ErrorRequestHandler } from 'express'
import { handleChat } from './chat/handle-chat.ts'
import type { Answerer } from './llm/claude-answerer.ts'

export interface AppOptions {
  /** Answers chat questions; `null` means the server has no Claude credentials. */
  answer?: Answerer | null
}

/**
 * Builds the Express app used for local development and tests. Production runs
 * the same handlers as Netlify Functions (see `netlify/functions/`).
 */
export function createApp({ answer = null }: AppOptions = {}) {
  const app = express()

  // Questions arrive with client-retrieved passages, which are JSON of a
  // non-trivial size; documents themselves are never uploaded.
  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' })
  })

  app.post('/api/chat', async (request, response) => {
    const result = await handleChat(request.body, { answer })
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
