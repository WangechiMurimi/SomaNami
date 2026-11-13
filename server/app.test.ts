// @vitest-environment node
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from './app.ts'
import type { Answerer } from './llm/claude-answerer.ts'

const passage = {
  documentId: 'doc-1',
  chunkId: 'doc-1:0',
  text: 'Mitochondria produce ATP.',
  source: { type: 'page', page: 1 },
}

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

    const response = await request(createApp({ answer }))
      .post('/api/chat')
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
    const response = await request(createApp())
      .post('/api/chat')
      .send({ question: 'Why ATP?', passages: [passage] })

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'not-configured' })
  })
})
