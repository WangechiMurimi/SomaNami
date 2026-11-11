import { afterEach, describe, expect, it, vi } from 'vitest'
import { askQuestion, ChatError } from './chat-client.js'

const reply = { answer: 'Yes.', citations: [], answerable: true }

function mockFetch(implementation) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(implementation)
}

afterEach(() => vi.restoreAllMocks())

describe('askQuestion', () => {
  it('posts the ADR request shape and returns the reply', async () => {
    const fetchMock = mockFetch(async () => ({
      ok: true,
      json: async () => reply,
    }))

    const passages = [{ documentId: 'doc-1', chunkId: 1, text: 'x' }]
    await expect(
      askQuestion({ question: 'Why?', passages, history: [] }),
    ).resolves.toEqual(reply)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/chat')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      question: 'Why?',
      passages,
      history: [],
    })
  })

  it('reports an unreachable service as retryable', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(askQuestion({ question: 'Why?' })).rejects.toMatchObject({
      code: 'offline',
      retryable: true,
    })
  })

  it('only offers a retry for server-side failures', async () => {
    mockFetch(async () => ({ ok: false, status: 400 }))
    await expect(askQuestion({ question: 'Why?' })).rejects.toMatchObject({
      retryable: false,
    })

    mockFetch(async () => ({ ok: false, status: 503 }))
    await expect(askQuestion({ question: 'Why?' })).rejects.toMatchObject({
      retryable: true,
    })
  })

  it('rejects a reply that breaks the contract', async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => ({ answer: 'Yes.' }),
    }))
    await expect(askQuestion({ question: 'Why?' })).rejects.toBeInstanceOf(
      ChatError,
    )
  })
})
