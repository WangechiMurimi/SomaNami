import express from 'express'
import type { ErrorRequestHandler, RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import { API_HEADERS } from './api-headers.ts'
import type { Authenticate } from './auth/types.ts'
import { handleChat } from './chat/handle-chat.ts'
import type { ChunkStoreFor } from './embed/chunk-store.ts'
import { handleEmbed } from './embed/handle-embed.ts'
import {
  EMBED_BODY_LIMIT_BYTES,
  EMBED_RATE_LIMIT,
  EMBED_RATE_WINDOW_SECONDS,
} from './embed/limits.ts'
import {
  CHAT_BODY_LIMIT_BYTES,
  CHAT_RATE_LIMIT,
  CHAT_RATE_WINDOW_SECONDS,
} from './chat/limits.ts'
import { fetchLink as defaultFetchLink } from './link/fetch-link.ts'
import {
  handleFetchLink,
  type FetchLinkDependencies,
} from './link/handle-fetch-link.ts'
import {
  LINK_BODY_LIMIT_BYTES,
  LINK_RATE_LIMIT,
  LINK_RATE_WINDOW_SECONDS,
} from './link/limits.ts'
import { linkResponseHeaders } from './link/link-headers.ts'
import type { LoadMaterials } from './chat/load-materials.ts'
import type { Answerer } from './llm/claude-answerer.ts'
import type { Embedder } from './llm/ollama-embedder.ts'

export interface AppOptions {
  /** Answers chat questions; `null` means the server has no Claude credentials. */
  answer?: Answerer | null
  /**
   * Verifies the caller's session. Omitting it refuses every chat, so a
   * forgotten wiring fails closed rather than opening the model to anyone.
   */
  authenticate?: Authenticate
  /** Opens a learner's chunks for `/api/embed`; `null` means Supabase isn't configured. */
  chunks?: ChunkStoreFor | null
  /** Embeds chunk text with our Ollama; `null` means it isn't configured. */
  embed?: Embedder | null
  /** Fetches links for `/api/fetch-link`; tests inject a fake. */
  fetchLink?: FetchLinkDependencies['fetch']
  /** Loads chat materials as the caller; `null` means Supabase isn't configured. */
  loadMaterials?: LoadMaterials | null
}

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
  chunks = null,
  embed = null,
  fetchLink = defaultFetchLink,
  loadMaterials = null,
}: AppOptions = {}) {
  const app = express()

  // First, so every /api reply (429s, 404s and errors included) carries them.
  app.use('/api', (_request, response, next) => {
    response.set(API_HEADERS)
    next()
  })

  // Limit before parsing, so a flood of large bodies is cut off cheaply. Each
  // app gets its own in-memory counter, which is enough for one dev process;
  // production relies on Netlify's per-IP limit (see netlify/functions/chat.ts).
  app.use('/api/chat', limitPerIp(CHAT_RATE_LIMIT, CHAT_RATE_WINDOW_SECONDS))
  // Each fetch costs an outbound request of up to 5 MB, so links get a
  // tighter budget of their own rather than sharing chat's.
  app.use(
    '/api/fetch-link',
    limitPerIp(LINK_RATE_LIMIT, LINK_RATE_WINDOW_SECONDS),
  )
  // Embedding keeps our CPU-bound Ollama busy, so it is budgeted separately.
  app.use('/api/embed', limitPerIp(EMBED_RATE_LIMIT, EMBED_RATE_WINDOW_SECONDS))

  // Chat bodies are small now (a question, material ids and recent history);
  // the cap mainly bounds a long history. A link request is only `{ url }`,
  // so it gets a far smaller cap. Original files go from the browser
  // straight to Supabase Storage (#145), never through this server.
  app.use('/api/chat', express.json({ limit: CHAT_BODY_LIMIT_BYTES }))
  // The embed body is `{}`: the server picks the chunks, so text never
  // travels from the browser on this route.
  app.use('/api/embed', express.json({ limit: EMBED_BODY_LIMIT_BYTES }))

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' })
  })

  app.post('/api/chat', async (request, response) => {
    const result = await handleChat(request.body, {
      answer,
      authenticate,
      authorization: request.get('authorization'),
      loadMaterials,
    })
    response.status(result.status).json(result.body)
  })

  app.post('/api/embed', async (request, response) => {
    const result = await handleEmbed(request.body, {
      authenticate,
      authorization: request.get('authorization'),
      chunks,
      embed,
    })
    response.status(result.status).json(result.body)
  })

  app.post(
    '/api/fetch-link',
    express.json({ limit: LINK_BODY_LIMIT_BYTES }),
    async (request, response) => {
      const result = await handleFetchLink(request.body, {
        authenticate,
        authorization: request.get('authorization'),
        fetch: fetchLink,
      })
      if (!('bytes' in result)) {
        response.status(result.status).json(result.body)
        return
      }
      // setHeader, not response.set: Express would append `charset=utf-8`
      // to a bare text type, overriding the page's own <meta charset>.
      for (const [name, value] of Object.entries(linkResponseHeaders(result))) {
        response.setHeader(name, value)
      }
      response.status(200).end(Buffer.from(result.bytes))
    },
  )
  app.use('/api/fetch-link', unreadableLinkBody)

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'not-found' })
  })

  app.use(jsonErrors)

  return app
}

/** A per-IP limiter answering JSON, like every other /api reply. */
function limitPerIp(limit: number, windowSeconds: number): RequestHandler {
  return rateLimit({
    windowMs: windowSeconds * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response, _next, options) => {
      response.status(options.statusCode).json({ error: 'rate-limited' })
    },
  })
}

// The client only ever sends `{ url }`, so a body we can't parse means the URL
// couldn't be used. Answering `invalid-url` keeps every failure of this route
// inside FetchLinkErrorCode, matching the Netlify Function.
const unreadableLinkBody: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  const status = (error as { status?: number }).status
  if (response.headersSent || (status !== 400 && status !== 413)) {
    return next(error)
  }
  response.status(status).json({ error: 'invalid-url' })
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
  // An over-limit body is the client's fault, not a server error; answer it
  // the way the Netlify Function does.
  if (status === 413) {
    response.status(413).json({ error: 'too-large' })
    return
  }
  console.error('Unhandled API error', error)
  response.status(500).json({ error: 'internal' })
}

export default createApp
