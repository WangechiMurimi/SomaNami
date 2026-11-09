import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Passage } from '../../types/contracts.ts'
import { askQuestion, ChatError } from './chat-client.ts'

const reply = { answer: 'Yes.', citations: [], answerable: true }

/** Stubs `fetch` with a fake that only implements what `askQuestion` reads. */
function mockFetch(implementation: () => Promise<Partial<Response>>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(
    // Deliberately partial: a full Response would hide which fields matter.
    implementation as unknown as typeof fetch,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('askQuestion', () => {
  it('posts the contract request shape and returns the reply', async () => {
    const fetchMock = mockFetch(async () => ({
      ok: true,
      json: async () => reply,
    }))

    const passages: Passage[] = [
      {
        documentId: 'doc-1',
        chunkId: 'doc-1:1',
        text: 'x',
        source: { type: 'page', page: 1 },
      },
    ]
    await expect(
      askQuestion({ question: 'Why?', passages, history: [] }),
    ).resolves.toEqual(reply)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/chat')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
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
