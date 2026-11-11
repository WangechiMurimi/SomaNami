// @vitest-environment node
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'

describe('createApp', () => {
  const app = createApp()

  it('reports health as ok', async () => {
    const response = await request(app).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })

  it('answers unknown API routes with JSON, not an HTML error page', async () => {
    const response = await request(app).get('/api/chat')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not-found' })
  })

  it('accepts a JSON body, which POST /api/chat will need', async () => {
    const response = await request(app)
      .post('/api/chat')
      .send({ question: 'hi' })

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not-found' })
  })
})
