// @vitest-environment node
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from './app.ts'
import type { Authenticate } from './auth/types.ts'
import type { Answerer } from './llm/claude-answerer.ts'

const passage = {
  documentId: 'doc-1',
  chunkId: 'doc-1:0',
  text: 'Mitochondria produce ATP.',
  source: { type: 'page', page: 1 },
}

const allow = () =>
  vi.fn<Authenticate>().mockResolvedValue({
    ok: true,
    user: { id: 'user-1', aal: 'aal1' },
  })

const deny = () =>
  vi.fn<Authenticate>().mockResolvedValue({ ok: false, reason: 'missing' })

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

    const response = await request(createApp({ answer, authenticate: allow() }))
      .post('/api/chat')
      .set('Authorization', 'Bearer token')
      .send({ question: 'Why ATP?', passages: [passage] })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      answer: 'ATP.',
      answerable: true,
      citations: [{ documentId: 'doc-1', chunkId: 'doc-1:0' }],
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
    const response = await request(createApp({ authenticate: allow() }))
      .post('/api/chat')
      .send({ question: 'Why ATP?', passages: [passage] })

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'not-configured' })
  })

  describe('authentication', () => {
    it('passes the Authorization header to the authenticator', async () => {
      const authenticate = allow()

      await request(createApp({ authenticate }))
        .post('/api/chat')
        .set('Authorization', 'Bearer abc.def.ghi')
        .send({ question: 'Why ATP?', passages: [] })

      expect(authenticate).toHaveBeenCalledWith('Bearer abc.def.ghi')
    })

    it('answers 401 without spending a model call', async () => {
      const answer = vi.fn<Answerer>()

      const response = await request(
        createApp({ answer, authenticate: deny() }),
      )
        .post('/api/chat')
        .send({ question: 'Why ATP?', passages: [passage] })

      expect(response.status).toBe(401)
      expect(response.body).toEqual({ error: 'unauthenticated' })
      expect(answer).not.toHaveBeenCalled()
    })

    it('refuses every chat when no authenticator is wired in', async () => {
      const answer = vi.fn<Answerer>()

      const response = await request(createApp({ answer }))
        .post('/api/chat')
        .set('Authorization', 'Bearer looks-real')
        .send({ question: 'Why ATP?', passages: [passage] })

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
