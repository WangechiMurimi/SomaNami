// @vitest-environment node
import { describe, expect, it } from 'vitest'
import chat, { config } from './chat.ts'

const post = (body: string) =>
  new Request('https://example.test/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

describe('chat function', () => {
  it('is routed at /api/chat', () => {
    expect(config.path).toBe('/api/chat')
  })

  it('rejects methods other than POST', async () => {
    const response = await chat(new Request('https://example.test/api/chat'))

    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('POST')
  })

  it('answers malformed JSON with a JSON 400', async () => {
    const response = await chat(post('{"question":'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid-json' })
  })

  it('delegates a valid body to the shared handler', async () => {
    // No passages, so the handler answers without needing an API key.
    const response = await chat(post(JSON.stringify({ question: 'Why ATP?' })))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ answerable: false })
  })
})
