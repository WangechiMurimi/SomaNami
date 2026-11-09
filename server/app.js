import express from 'express'

/**
 * Builds the Express app. The app is separated from `server.js` so tests (and
 * later routes such as POST /api/chat) can mount it without opening a port.
 */
export function createApp() {
  const app = express()

  // The chat route will receive questions plus client-retrieved passages, which
  // are JSON of a non-trivial size; documents themselves are never uploaded.
  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' })
  })

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'not-found' })
  })

  return app
}

export default createApp
