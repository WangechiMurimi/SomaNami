// @vitest-environment node
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from './app.ts'
import type { Authenticate } from './auth/types.ts'
import type { FetchedLink } from './link/fetch-link.ts'
import type { FetchLinkDependencies } from './link/handle-fetch-link.ts'
import { LINK_BODY_LIMIT_BYTES, LINK_RATE_LIMIT } from './link/limits.ts'
import type { LoadMaterials } from './chat/load-materials.ts'
import type { Answerer } from './llm/answerer.ts'

const question = { question: 'Why ATP?', materialIds: ['doc-1'] }

/** One material the signed-in user owns; stands in for Supabase. */
const loadMaterials = () =>
  vi.fn<LoadMaterials>().mockResolvedValue([
    {
      id: 'doc-1',
      name: 'Cells.pdf',
      chunks: [
        {
          id: 'doc-1:0',
          text: 'Mitochondria produce ATP.',
          source: { type: 'page', page: 1 },
        },
      ],
    },
  ])

const allow = () =>
  vi.fn<Authenticate>().mockResolvedValue({
    ok: true,
    user: { id: 'user-1', aal: 'aal1' },
    accessToken: 'token',
  })

const deny = () =>
  vi.fn<Authenticate>().mockResolvedValue({ ok: false, reason: 'missing' })

const pdf: FetchedLink = {
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x0a]),
  contentType: 'application/pdf',
  finalUrl: 'https://example.com/papers/cells.pdf',
  fileName: 'Cell biology.pdf',
}

const fetched = (link: FetchedLink = pdf) =>
  vi.fn<FetchLinkDependencies['fetch']>().mockResolvedValue({ ok: true, link })

describe('createApp', () => {
  it('reports health as ok', async () => {
    const response = await request(createApp()).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })

  it('answers unknown API routes with JSON, not an HTML error page', async () => {
    const response = await request(createApp()).get('/api/nothing-here')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not-found' })
  })

  it('serves POST /api/chat through the shared handler', async () => {
    const answer = vi.fn<Answerer>().mockResolvedValue({
      kind: 'answer',
      answer: { answer: 'ATP.', answerable: true, citations: ['doc-1:0'] },
    })

    const response = await request(
      createApp({
        answer,
        authenticate: allow(),
        loadMaterials: loadMaterials(),
      }),
    )
      .post('/api/chat')
      .set('Authorization', 'Bearer token')
      .send(question)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      answer: 'ATP.',
      answerable: true,
      citations: [{ documentId: 'doc-1', chunkId: 'doc-1:0' }],
      passages: [
        {
          documentId: 'doc-1',
          chunkId: 'doc-1:0',
          documentName: 'Cells.pdf',
          text: 'Mitochondria produce ATP.',
          source: { type: 'page', page: 1 },
        },
      ],
    })
  })

  it('answers a malformed JSON body with JSON', async () => {
    const response = await request(createApp())
      .post('/api/chat')
      .set('Content-Type', 'application/json')
      .send('{"question":')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'invalid-json' })
  })

  it('reports a server without credentials as not configured', async () => {
    const response = await request(
      createApp({ authenticate: allow(), loadMaterials: loadMaterials() }),
    )
      .post('/api/chat')
      .send(question)

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'not-configured' })
  })

  it('reports a server without Supabase settings as not configured', async () => {
    const answer = vi.fn<Answerer>()

    const response = await request(createApp({ answer, authenticate: allow() }))
      .post('/api/chat')
      .send(question)

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'not-configured' })
    expect(answer).not.toHaveBeenCalled()
  })

  it('answers a JSON 502 when materials cannot be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = vi.fn<LoadMaterials>().mockRejectedValue(new Error('down'))

    const response = await request(
      createApp({ authenticate: allow(), loadMaterials: failing }),
    )
      .post('/api/chat')
      .send(question)

    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'materials-unavailable' })
    vi.restoreAllMocks()
  })

  describe('authentication', () => {
    it('passes the Authorization header to the authenticator', async () => {
      const authenticate = allow()

      await request(createApp({ authenticate }))
        .post('/api/chat')
        .set('Authorization', 'Bearer abc.def.ghi')
        .send({ question: 'Why ATP?', materialIds: [] })

      expect(authenticate).toHaveBeenCalledWith('Bearer abc.def.ghi')
    })

    it('answers 401 without spending a model call', async () => {
      const answer = vi.fn<Answerer>()

      const response = await request(
        createApp({ answer, authenticate: deny() }),
      )
        .post('/api/chat')
        .send(question)

      expect(response.status).toBe(401)
      expect(response.body).toEqual({ error: 'unauthenticated' })
      expect(answer).not.toHaveBeenCalled()
    })

    it('refuses every chat when no authenticator is wired in', async () => {
      const answer = vi.fn<Answerer>()

      const response = await request(createApp({ answer }))
        .post('/api/chat')
        .set('Authorization', 'Bearer looks-real')
        .send(question)

      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(answer).not.toHaveBeenCalled()
    })
  })

  describe('rate limiting', () => {
    it('answers JSON 429 once a client exceeds the chat limit', async () => {
      const app = createApp({ authenticate: deny() })

      for (let index = 0; index < 20; index++) {
        const response = await request(app).post('/api/chat').send({})
        expect(response.status).toBe(401)
      }
      const limited = await request(app).post('/api/chat').send({})

      expect(limited.status).toBe(429)
      expect(limited.body).toEqual({ error: 'rate-limited' })
      expect(limited.headers['retry-after']).toBeDefined()
    })

    it('sends standard rate-limit headers', async () => {
      const response = await request(createApp({ authenticate: deny() }))
        .post('/api/chat')
        .send({})

      expect(response.headers['ratelimit-policy']).toBeDefined()
      expect(response.headers['x-ratelimit-limit']).toBeUndefined()
    })

    it('leaves health public and unlimited', async () => {
      const app = createApp({ authenticate: deny() })

      for (let index = 0; index < 25; index++) {
        const response = await request(app).get('/api/health')
        expect(response.status).toBe(200)
      }
    })
  })

  it('answers an over-limit chat body with JSON 413', async () => {
    const response = await request(createApp({ authenticate: allow() }))
      .post('/api/chat')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ question: 'x'.repeat(1024 * 1024) }))

    expect(response.status).toBe(413)
    expect(response.body).toEqual({ error: 'too-large' })
  })

  describe('POST /api/fetch-link', () => {
    it('returns the fetched bytes with their type, final URL and name', async () => {
      const fetchLink = fetched()

      const response = await request(
        createApp({ authenticate: allow(), fetchLink }),
      )
        .post('/api/fetch-link')
        .set('Authorization', 'Bearer token')
        .send({ url: 'https://example.com/papers/cells.pdf' })
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => done(null, Buffer.concat(chunks)))
        })

      expect(response.status).toBe(200)
      expect(new Uint8Array(response.body as Buffer)).toEqual(pdf.bytes)
      expect(response.headers['content-type']).toBe('application/pdf')
      expect(response.headers['content-length']).toBe('7')
      expect(response.headers['x-final-url']).toBe(pdf.finalUrl)
      expect(response.headers['content-disposition']).toBe(
        "attachment; filename*=UTF-8''Cell%20biology.pdf",
      )
      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.headers['x-content-type-options']).toBe('nosniff')
      expect(fetchLink).toHaveBeenCalledWith(
        'https://example.com/papers/cells.pdf',
      )
    })

    it('never invents a charset the upstream did not send', async () => {
      const fetchLink = fetched({ ...pdf, contentType: 'text/html' })

      const response = await request(
        createApp({ authenticate: allow(), fetchLink }),
      )
        .post('/api/fetch-link')
        .send({ url: 'https://example.com/' })

      expect(response.headers['content-type']).toBe('text/html')
    })

    it('keeps the upstream charset', async () => {
      const fetchLink = fetched({
        ...pdf,
        contentType: 'text/html; charset=ISO-8859-1',
      })

      const response = await request(
        createApp({ authenticate: allow(), fetchLink }),
      )
        .post('/api/fetch-link')
        .send({ url: 'https://example.com/' })

      expect(response.headers['content-type']).toBe(
        'text/html; charset=ISO-8859-1',
      )
    })

    it('requires a session and never fetches without one', async () => {
      const fetchLink = fetched()

      const response = await request(
        createApp({ authenticate: deny(), fetchLink }),
      )
        .post('/api/fetch-link')
        .send({ url: 'https://example.com/' })

      expect(response.status).toBe(401)
      expect(response.body).toEqual({ error: 'unauthorized' })
      expect(fetchLink).not.toHaveBeenCalled()
    })

    it('refuses every fetch when no authenticator is wired in', async () => {
      const fetchLink = fetched()

      const response = await request(createApp({ fetchLink }))
        .post('/api/fetch-link')
        .set('Authorization', 'Bearer looks-real')
        .send({ url: 'https://example.com/' })

      expect(response.status).toBe(503)
      expect(response.body).toEqual({ error: 'not-configured' })
      expect(fetchLink).not.toHaveBeenCalled()
    })

    it('answers an invalid body with JSON 400', async () => {
      const response = await request(createApp({ authenticate: allow() }))
        .post('/api/fetch-link')
        .send({ link: 'https://example.com/' })

      expect(response.status).toBe(400)
      expect(response.body).toEqual({ error: 'invalid-url' })
    })

    it('answers malformed JSON with JSON 400', async () => {
      const response = await request(createApp({ authenticate: allow() }))
        .post('/api/fetch-link')
        .set('Content-Type', 'application/json')
        .send('{"url":')

      expect(response.status).toBe(400)
      expect(response.body).toEqual({ error: 'invalid-url' })
    })

    it('answers a body over its small limit with JSON 413', async () => {
      const fetchLink = fetched()

      const response = await request(
        createApp({ authenticate: allow(), fetchLink }),
      )
        .post('/api/fetch-link')
        .send({
          url: `https://example.com/${'a'.repeat(LINK_BODY_LIMIT_BYTES)}`,
        })

      expect(response.status).toBe(413)
      expect(response.body).toEqual({ error: 'invalid-url' })
      expect(fetchLink).not.toHaveBeenCalled()
    })

    it('reports fetch failures as JSON with their status', async () => {
      const fetchLink = vi
        .fn<FetchLinkDependencies['fetch']>()
        .mockResolvedValue({ ok: false, code: 'too-large' })

      const response = await request(
        createApp({ authenticate: allow(), fetchLink }),
      )
        .post('/api/fetch-link')
        .send({ url: 'https://example.com/huge.pdf' })

      expect(response.status).toBe(413)
      expect(response.body).toEqual({ error: 'too-large' })
      expect(response.headers['cache-control']).toBe('no-store')
    })

    it('answers JSON 429 once a client exceeds the link limit', async () => {
      const app = createApp({ authenticate: deny() })

      for (let index = 0; index < LINK_RATE_LIMIT; index++) {
        const response = await request(app).post('/api/fetch-link').send({})
        expect(response.status).toBe(401)
      }
      const limited = await request(app).post('/api/fetch-link').send({})

      expect(limited.status).toBe(429)
      expect(limited.body).toEqual({ error: 'rate-limited' })
      expect(limited.headers['retry-after']).toBeDefined()
    })

    it('counts links separately from chat', async () => {
      const app = createApp({ authenticate: deny() })

      for (let index = 0; index < LINK_RATE_LIMIT; index++) {
        await request(app).post('/api/fetch-link').send({})
      }
      const chat = await request(app).post('/api/chat').send({})

      expect(chat.status).toBe(401)
    })
  })

  describe('response headers', () => {
    it.each([
      [
        'health',
        (app: ReturnType<typeof createApp>) => request(app).get('/api/health'),
      ],
      [
        'an unknown route',
        (app: ReturnType<typeof createApp>) => request(app).get('/api/nope'),
      ],
      [
        'a refused chat',
        (app: ReturnType<typeof createApp>) =>
          request(app).post('/api/chat').send({}),
      ],
    ])('marks %s as uncacheable and unsniffable', async (_label, send) => {
      const response = await send(createApp({ authenticate: deny() }))

      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.headers['x-content-type-options']).toBe('nosniff')
    })
  })
})
