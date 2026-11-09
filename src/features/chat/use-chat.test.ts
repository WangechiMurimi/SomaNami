import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { askQuestion, ChatError } from './chat-client.ts'
import { useChat } from './use-chat.ts'

vi.mock('./chat-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chat-client.ts')>()),
  askQuestion: vi.fn(),
}))

const answer = (overrides = {}) => ({
  answer: 'Because light drives it.',
  citations: [],
  answerable: true,
  ...overrides,
})

beforeEach(() => {
  // A block body, not a one-liner: Vitest treats a returned function as a
  // teardown callback, and `mockReset()` returns the mock itself.
  vi.mocked(askQuestion).mockReset()
})

describe('useChat', () => {
  it('ignores blank questions', async () => {
    const { result } = renderHook(() => useChat())

    await act(() => result.current.send('   '))

    expect(askQuestion).not.toHaveBeenCalled()
    expect(result.current.messages).toEqual([])
  })

  it('sends prior turns as history and keeps the current one out of it', async () => {
    vi.mocked(askQuestion).mockResolvedValue(answer())
    const { result } = renderHook(() => useChat())

    await act(() => result.current.send('First?'))
    await act(() => result.current.send('Second?'))

    expect(askQuestion).toHaveBeenLastCalledWith({
      question: 'Second?',
      passages: [],
      history: [
        { role: 'user', content: 'First?' },
        { role: 'assistant', content: 'Because light drives it.' },
      ],
    })
  })

  it('resolves citations against the passages it sent', async () => {
    const passages = [
      {
        documentId: 'doc-1',
        chunkId: 'doc-1:2',
        text: 'Light drives it.',
        source: { type: 'page' as const, page: 4 },
      },
    ]
    vi.mocked(askQuestion).mockResolvedValue(
      answer({ citations: [{ documentId: 'doc-1', chunkId: 'doc-1:2' }] }),
    )
    const { result } = renderHook(() =>
      useChat({
        documents: [{ id: 'doc-1', name: 'biology.pdf' }],
        selectPassages: () => passages,
      }),
    )

    await act(() => result.current.send('Why?'))

    const last = result.current.messages.at(-1)
    expect(last?.role).toBe('assistant')
    expect(last?.role === 'assistant' && last.citations).toEqual([
      {
        key: 'doc-1:2',
        label: 'biology.pdf · Page 4',
        text: 'Light drives it.',
      },
    ])
  })

  it('retries the unanswered question without duplicating it', async () => {
    vi.mocked(askQuestion).mockRejectedValueOnce(
      new ChatError('Offline', { code: 'offline' }),
    )
    const { result } = renderHook(() => useChat())

    await act(() => result.current.send('Why?'))
    expect(result.current.status).toBe('error')
    expect(result.current.error).toEqual({
      message: 'Offline',
      retryable: true,
    })

    vi.mocked(askQuestion).mockResolvedValueOnce(answer())
    await act(() => result.current.retry())

    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(result.current.error).toBeNull()
    expect(result.current.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
    ])
    expect(askQuestion).toHaveBeenLastCalledWith({
      question: 'Why?',
      passages: [],
      history: [],
    })
  })

  it('hides unexpected failures behind a retryable message and logs them', async () => {
    const bug = new TypeError('x is not a function')
    vi.mocked(askQuestion).mockImplementation(async () => {
      throw bug
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useChat())

    await act(() => result.current.send('Why?'))

    expect(result.current.error).toEqual({
      message: 'Something went wrong while answering that question.',
      retryable: true,
    })
    expect(log).toHaveBeenCalledWith('Unexpected chat failure', bug)
    log.mockRestore()
  })
})

describe('useChat with a saved conversation', () => {
  const restored = [
    { id: 'm1', role: 'user' as const, content: 'Earlier question?' },
    {
      id: 'm2',
      role: 'assistant' as const,
      content: 'Earlier answer.',
      answerable: true,
      citations: [],
    },
  ]

  it('starts from the restored transcript and sends it as history', async () => {
    vi.mocked(askQuestion).mockResolvedValue(answer())
    const { result } = renderHook(() => useChat({ initialMessages: restored }))

    expect(result.current.messages).toEqual(restored)
    await act(() => result.current.send('Follow-up?'))

    expect(askQuestion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        history: [
          { role: 'user', content: 'Earlier question?' },
          { role: 'assistant', content: 'Earlier answer.' },
        ],
      }),
    )
  })

  it('reports each answered exchange so it can be saved', async () => {
    const reply = answer()
    vi.mocked(askQuestion).mockResolvedValue(reply)
    const onAnswered = vi.fn()
    const { result } = renderHook(() => useChat({ onAnswered }))

    await act(() => result.current.send('Why?'))

    expect(onAnswered).toHaveBeenCalledWith({ question: 'Why?', reply })
  })

  it('does not report a failed question', async () => {
    vi.mocked(askQuestion).mockRejectedValue(new ChatError('offline'))
    const onAnswered = vi.fn()
    const { result } = renderHook(() => useChat({ onAnswered }))

    await act(() => result.current.send('Why?'))

    expect(onAnswered).not.toHaveBeenCalled()
  })

  it('keeps a shown answer when saving it fails', async () => {
    vi.mocked(askQuestion).mockResolvedValue(answer())
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onAnswered = vi.fn().mockRejectedValue(new Error('quota'))
    const { result } = renderHook(() => useChat({ onAnswered }))

    await act(() => result.current.send('Why?'))

    expect(result.current.status).toBe('idle')
    expect(result.current.error).toBeNull()
    expect(result.current.messages.at(-1)?.content).toBe(
      'Because light drives it.',
    )
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})
