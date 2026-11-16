import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askQuestion, ChatError, MODEL_WAKING_MESSAGE } from './chat-client.ts'
import {
  MAX_WAKE_RETRY_DELAY_MS,
  MAX_WAKE_WAIT_MS,
  useChat,
  WAKE_TIMED_OUT_MESSAGE,
  wakeRetryDelayMs,
} from './use-chat.ts'

vi.mock('./chat-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chat-client.ts')>()),
  askQuestion: vi.fn(),
}))

const answer = (overrides = {}) => ({
  answer: 'Because light drives it.',
  citations: [],
  answerable: true,
  passages: [],
  ...overrides,
})

const lightPassage = {
  documentId: 'doc-1',
  chunkId: 'doc-1:2',
  documentName: 'Biology (cloud).pdf',
  text: 'Light drives it.',
  source: { type: 'page' as const, page: 4 },
}

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
      materialIds: [],
      history: [
        { role: 'user', content: 'First?' },
        { role: 'assistant', content: 'Because light drives it.' },
      ],
    })
  })

  it("sends the conversation's material ids", async () => {
    vi.mocked(askQuestion).mockResolvedValue(answer())
    const { result } = renderHook(() =>
      useChat({ materialIds: ['doc-1', 'doc-2'] }),
    )

    await act(() => result.current.send('Why?'))

    expect(askQuestion).toHaveBeenLastCalledWith(
      expect.objectContaining({ materialIds: ['doc-1', 'doc-2'] }),
    )
  })

  it('resolves citations against the passages the reply carries', async () => {
    vi.mocked(askQuestion).mockResolvedValue(
      answer({
        citations: [{ documentId: 'doc-1', chunkId: 'doc-1:2' }],
        passages: [lightPassage],
      }),
    )
    const { result } = renderHook(() =>
      useChat({
        documents: [{ id: 'doc-1', name: 'biology.pdf' }],
        materialIds: ['doc-1'],
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

  it("names a citation from the reply when this device doesn't hold the material", async () => {
    vi.mocked(askQuestion).mockResolvedValue(
      answer({
        citations: [{ documentId: 'doc-1', chunkId: 'doc-1:2' }],
        passages: [lightPassage],
      }),
    )
    const { result } = renderHook(() => useChat({ materialIds: ['doc-1'] }))

    await act(() => result.current.send('Why?'))

    const last = result.current.messages.at(-1)
    expect(last?.role === 'assistant' && last.citations).toEqual([
      {
        key: 'doc-1:2',
        label: 'Biology (cloud).pdf · Page 4',
        text: 'Light drives it.',
      },
    ])
  })

  it('retries the unanswered question without duplicating it', async () => {
    vi.mocked(askQuestion).mockRejectedValueOnce(
      new ChatError('Failed', { code: 'network' }),
    )
    const { result } = renderHook(() => useChat())

    await act(() => result.current.send('Why?'))
    expect(result.current.status).toBe('error')
    expect(result.current.error).toEqual({
      message: 'Failed',
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
      materialIds: [],
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
    vi.mocked(askQuestion).mockRejectedValue(new ChatError('failed'))
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

  describe('while the model starts up (#201)', () => {
    const waking = (retryAfterSeconds = 30) =>
      new ChatError(MODEL_WAKING_MESSAGE, {
        code: 'model-waking',
        retryAfterSeconds,
      })

    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('shows a waiting state, then resends the same question by itself', async () => {
      vi.mocked(askQuestion)
        .mockRejectedValueOnce(waking(30))
        .mockResolvedValueOnce(answer())
      const { result } = renderHook(() => useChat())

      await act(() => result.current.send('Why light?'))

      expect(result.current.status).toBe('waking')
      expect(result.current.error).toBeNull()
      expect(result.current.messages).toEqual([
        expect.objectContaining({ role: 'user', content: 'Why light?' }),
      ])

      await act(() => vi.advanceTimersByTimeAsync(29_999))
      expect(askQuestion).toHaveBeenCalledTimes(1)
      await act(() => vi.advanceTimersByTimeAsync(1))

      expect(askQuestion).toHaveBeenCalledTimes(2)
      expect(vi.mocked(askQuestion).mock.calls[1]![0]).toEqual({
        question: 'Why light?',
        materialIds: [],
        history: [],
      })
      expect(result.current.status).toBe('idle')
      expect(result.current.messages.map(({ role }) => role)).toEqual([
        'user',
        'assistant',
      ])
    })

    it('backs off between retries, following the server hint', async () => {
      vi.mocked(askQuestion)
        .mockRejectedValueOnce(waking(20))
        .mockRejectedValueOnce(waking(20))
        .mockResolvedValueOnce(answer())
      const { result } = renderHook(() => useChat())

      await act(() => result.current.send('Why?'))
      await act(() => vi.advanceTimersByTimeAsync(20_000))
      expect(askQuestion).toHaveBeenCalledTimes(2)
      expect(result.current.status).toBe('waking')

      // The second wait is half as long again.
      await act(() => vi.advanceTimersByTimeAsync(29_999))
      expect(askQuestion).toHaveBeenCalledTimes(2)
      await act(() => vi.advanceTimersByTimeAsync(1))
      expect(askQuestion).toHaveBeenCalledTimes(3)
      expect(result.current.status).toBe('idle')
    })

    it('hands back a retryable error once the wait runs too long', async () => {
      vi.mocked(askQuestion).mockRejectedValue(waking(45))
      const { result } = renderHook(() => useChat())

      await act(() => result.current.send('Why?'))
      await act(() => vi.advanceTimersByTimeAsync(MAX_WAKE_WAIT_MS))

      expect(result.current.status).toBe('error')
      expect(result.current.error).toEqual({
        message: WAKE_TIMED_OUT_MESSAGE,
        retryable: true,
      })
      const calls = vi.mocked(askQuestion).mock.calls.length
      await act(() => vi.advanceTimersByTimeAsync(MAX_WAKE_WAIT_MS))
      expect(askQuestion).toHaveBeenCalledTimes(calls)

      // The question is still there for a manual retry.
      vi.mocked(askQuestion).mockResolvedValueOnce(answer())
      await act(() => result.current.retry())
      expect(result.current.status).toBe('idle')
      expect(
        result.current.messages.filter(({ role }) => role === 'user'),
      ).toHaveLength(1)
    })

    it('ignores a new send while a retry is scheduled', async () => {
      vi.mocked(askQuestion).mockRejectedValueOnce(waking())
      const { result } = renderHook(() => useChat())

      await act(() => result.current.send('Why?'))
      await act(() => result.current.send('Another?'))

      expect(askQuestion).toHaveBeenCalledTimes(1)
    })

    it('stops retrying when the chat unmounts', async () => {
      vi.mocked(askQuestion).mockRejectedValueOnce(waking())
      const { result, unmount } = renderHook(() => useChat())

      await act(() => result.current.send('Why?'))
      unmount()
      await vi.advanceTimersByTimeAsync(MAX_WAKE_WAIT_MS)

      expect(askQuestion).toHaveBeenCalledTimes(1)
    })
  })
})

describe('wakeRetryDelayMs', () => {
  it('starts at the hint and grows by half each attempt, up to a cap', () => {
    expect(wakeRetryDelayMs(1, 20)).toBe(20_000)
    expect(wakeRetryDelayMs(2, 20)).toBe(30_000)
    expect(wakeRetryDelayMs(3, 20)).toBe(MAX_WAKE_RETRY_DELAY_MS)
    expect(wakeRetryDelayMs(1)).toBe(30_000)
  })
})
