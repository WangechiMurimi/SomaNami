import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatPanel from './ChatPanel.tsx'
import { askQuestion, ChatError, MODEL_WAKING_MESSAGE } from './chat-client.ts'
import type { ChatTurn } from './use-chat.ts'
import type { ChatReply } from '../../types/contracts.ts'

vi.mock('./chat-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chat-client.ts')>()),
  askQuestion: vi.fn(),
}))

const PASSAGES = [
  {
    documentId: 'doc-1',
    chunkId: 'doc-1:2',
    documentName: 'biology.pdf',
    text: 'Light drives photosynthesis.',
    source: { type: 'page' as const, page: 4 },
  },
]

function setup({
  initialMessages,
  initialQuestion,
}: { initialMessages?: ChatTurn[]; initialQuestion?: string } = {}) {
  const user = userEvent.setup()
  render(
    <ChatPanel
      documents={[{ id: 'doc-1', name: 'biology.pdf' }]}
      materialIds={['doc-1']}
      initialMessages={initialMessages}
      initialQuestion={initialQuestion}
    />,
  )
  return {
    user,
    box: screen.getByLabelText('Ask a follow-up about your materials'),
    send: screen.getByRole('button', { name: 'Send' }),
  }
}

beforeEach(() => {
  // A block body, not a one-liner: Vitest treats a returned function as a
  // teardown callback, and `mockReset()` returns the mock itself.
  vi.mocked(askQuestion).mockReset()
})

describe('ChatPanel', () => {
  it('cannot submit an empty or whitespace question', async () => {
    const { user, box, send } = setup()
    expect(send).toBeDisabled()

    await user.type(box, '   ')
    expect(send).toBeDisabled()

    await user.type(box, '{Enter}')
    expect(askQuestion).not.toHaveBeenCalled()
  })

  it('shows the question, a loading state, then the answer and its citations', async () => {
    let settle: (reply: ChatReply) => void = () => {}
    vi.mocked(askQuestion).mockReturnValue(
      new Promise((resolve) => {
        settle = resolve
      }),
    )
    const { user, box, send } = setup()

    await user.type(box, 'Why do leaves need light?')
    await user.click(send)

    const log = screen.getByRole('region', { name: 'Conversation' })
    expect(within(log).getByText('Why do leaves need light?')).toBeVisible()
    expect(within(log).getByText('Reading your materials…')).toBeVisible()
    expect(log).toHaveAttribute('aria-busy', 'true')
    expect(send).toBeDisabled()
    expect(box).toHaveValue('')

    settle({
      answer: 'Light drives photosynthesis.',
      citations: [{ documentId: 'doc-1', chunkId: 'doc-1:2' }],
      answerable: true,
      passages: PASSAGES,
    })

    const reply = await screen.findByRole('article', {
      name: 'Answer from your materials',
    })
    expect(within(reply).getByText('From your materials')).toBeVisible()
    expect(within(reply).getByText('biology.pdf · Page 4')).toBeVisible()
    await waitFor(() =>
      expect(
        screen.queryByText('Reading your materials…'),
      ).not.toBeInTheDocument(),
    )
    expect(log).toHaveAttribute('aria-busy', 'false')
  })

  it('opens a cited passage in place from its source chip', async () => {
    vi.mocked(askQuestion).mockResolvedValue({
      answer: 'Light drives photosynthesis.',
      citations: [{ documentId: 'doc-1', chunkId: 'doc-1:2' }],
      answerable: true,
      passages: PASSAGES,
    })
    const { user, box } = setup()

    await user.type(box, 'Why do leaves need light?{Enter}')
    const reply = await screen.findByRole('article', {
      name: 'Answer from your materials',
    })
    expect(within(reply).getByText('one passage')).toBeVisible()
    const source = within(reply).getByRole('button', {
      name: 'biology.pdf · Page 4',
    })
    expect(source).toHaveAttribute('aria-expanded', 'false')

    await user.click(source)
    expect(source).toHaveAttribute('aria-expanded', 'true')
    const passage = within(reply).getByRole('blockquote')
    expect(passage).toHaveTextContent('Light drives photosynthesis.')
    expect(source).toHaveAttribute('aria-controls', passage.id)

    await user.click(source)
    expect(within(reply).queryByRole('blockquote')).not.toBeInTheDocument()
  })

  it('asks for the latest answer in another format (US-05)', async () => {
    vi.mocked(askQuestion).mockResolvedValue({
      answer: 'Light drives photosynthesis.',
      citations: [{ documentId: 'doc-1', chunkId: 'doc-1:2' }],
      answerable: true,
      passages: PASSAGES,
    })
    const { user, box } = setup()
    expect(
      screen.queryByRole('group', { name: 'Show another format' }),
    ).not.toBeInTheDocument()

    await user.type(box, 'Why do leaves need light?{Enter}')
    const formats = within(
      await screen.findByRole('group', { name: 'Show another format' }),
    )
    await user.click(formats.getByRole('button', { name: 'Summary' }))

    await waitFor(() => expect(askQuestion).toHaveBeenCalledTimes(2))
    expect(vi.mocked(askQuestion).mock.lastCall?.[0]).toMatchObject({
      question: 'Summarise that as a few short bullet points.',
      history: [
        { role: 'user', content: 'Why do leaves need light?' },
        { role: 'assistant', content: 'Light drives photosynthesis.' },
      ],
    })
  })

  it('offers no other format for an unanswered question', async () => {
    vi.mocked(askQuestion).mockResolvedValue({
      answer: 'The documents do not cover tax law.',
      citations: [],
      answerable: false,
      passages: [],
    })
    const { user, box } = setup()

    await user.type(box, 'What is the tax rate?{Enter}')
    await screen.findByRole('article', {
      name: 'Not answered from your materials',
    })
    expect(
      screen.queryByRole('group', { name: 'Show another format' }),
    ).not.toBeInTheDocument()
  })

  it('submits on Enter and keeps Shift+Enter for a newline', async () => {
    vi.mocked(askQuestion).mockResolvedValue({
      answer: 'Yes.',
      citations: [],
      passages: [],
      answerable: true,
    })
    const { user, box } = setup()

    await user.type(box, 'One{Shift>}{Enter}{/Shift}Two')
    expect(box).toHaveValue('One\nTwo')
    expect(askQuestion).not.toHaveBeenCalled()

    await user.type(box, '{Enter}')
    await waitFor(() =>
      expect(askQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ question: 'One\nTwo' }),
      ),
    )
  })

  it('marks an unanswerable reply as unsupported instead of an answer', async () => {
    vi.mocked(askQuestion).mockResolvedValue({
      answer: 'The documents do not cover tax law.',
      citations: [],
      passages: [],
      answerable: false,
    })
    const { user, box, send } = setup()

    await user.type(box, 'What is the tax rate?')
    await user.click(send)

    const reply = await screen.findByRole('article', {
      name: 'Not answered from your materials',
    })
    expect(
      within(reply).getByText('Not answered from your materials'),
    ).toBeVisible()
    expect(within(reply).getByText(/Try rephrasing the question/)).toBeVisible()
    expect(screen.queryByText('From your materials')).not.toBeInTheDocument()
  })

  it('flags an answer with no citations as ungrounded', async () => {
    vi.mocked(askQuestion).mockResolvedValue({
      answer: 'Here is an analogy.',
      citations: [],
      passages: [],
      answerable: true,
    })
    const { user, box, send } = setup()

    await user.type(box, 'Explain it simply')
    await user.click(send)

    expect(
      await screen.findByText(/no passage from your materials behind it/),
    ).toBeVisible()
  })

  it('shows a failed request as an alert with a working retry', async () => {
    vi.mocked(askQuestion).mockRejectedValueOnce(
      new ChatError('Couldn’t get an answer. Try again.', {
        code: 'network',
      }),
    )
    const { user, box, send } = setup()

    await user.type(box, 'Why?')
    await user.click(send)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Couldn’t get an answer. Try again.')

    vi.mocked(askQuestion).mockResolvedValueOnce({
      answer: 'Light drives photosynthesis.',
      citations: [],
      passages: [],
      answerable: true,
    })
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))

    expect(
      await screen.findByRole('article', {
        name: 'Answer from your materials',
      }),
    ).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // The question was not duplicated by the retry.
    expect(screen.getAllByText('Why?')).toHaveLength(1)
  })

  it('asks the question it was opened with, once', async () => {
    vi.mocked(askQuestion).mockResolvedValue({
      answer: 'Light drives photosynthesis.',
      citations: [],
      answerable: true,
      passages: [],
    })
    setup({ initialQuestion: 'Why do leaves need light?' })

    expect(
      await screen.findByRole('article', {
        name: 'Answer from your materials',
      }),
    ).toBeVisible()
    expect(askQuestion).toHaveBeenCalledTimes(1)
    expect(vi.mocked(askQuestion).mock.calls[0]?.[0].question).toBe(
      'Why do leaves need light?',
    )
  })

  it('never shows an offline state', () => {
    setup()

    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps the opening question retryable when it can’t reach SomaNami', async () => {
    vi.mocked(askQuestion)
      .mockRejectedValueOnce(
        new ChatError('Couldn’t get an answer. Try again.', {
          code: 'network',
        }),
      )
      .mockResolvedValueOnce({
        answer: 'Light drives photosynthesis.',
        citations: [],
        answerable: true,
        passages: [],
      })
    const user = userEvent.setup()
    setup({ initialQuestion: 'Why do leaves need light?' })

    const alert = await screen.findByRole('alert')
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))

    expect(
      await screen.findByRole('article', {
        name: 'Answer from your materials',
      }),
    ).toBeVisible()
    expect(
      vi.mocked(askQuestion).mock.calls.map(([request]) => request.question),
    ).toEqual(['Why do leaves need light?', 'Why do leaves need light?'])
  })

  it('words an ended session without offering a retry', async () => {
    vi.mocked(askQuestion).mockRejectedValue(
      new ChatError('Your session ended. Sign in again to ask questions.', {
        code: 'unauthenticated',
        retryable: false,
      }),
    )
    const { user, box } = setup()

    await user.type(box, 'Why?{Enter}')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Your session ended. Sign in again to ask questions.',
    )
    expect(
      within(alert).queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument()
  })

  it('shows that the tutor is starting up, then the answer, without retyping (#201)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      vi.mocked(askQuestion)
        .mockRejectedValueOnce(
          new ChatError(MODEL_WAKING_MESSAGE, {
            code: 'model-waking',
            retryAfterSeconds: 5,
          }),
        )
        .mockResolvedValueOnce({
          answer: 'Light drives photosynthesis.',
          citations: [],
          answerable: true,
          passages: [],
        })
      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      })
      render(<ChatPanel documents={[]} materialIds={['doc-1']} />)
      const box = screen.getByLabelText('Ask a follow-up about your materials')

      await user.type(box, 'Why do leaves need light?{Enter}')

      const log = screen.getByRole('region', { name: 'Conversation' })
      const waiting = await within(log).findByRole('status')
      expect(waiting).toHaveTextContent('Starting up the tutor')
      expect(waiting).toHaveTextContent('about a minute')
      expect(log).toHaveAttribute('aria-busy', 'true')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      await user.type(box, 'Next')
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()

      await vi.advanceTimersByTimeAsync(5_000)

      expect(
        await within(log).findByText('Light drives photosynthesis.'),
      ).toBeVisible()
      expect(
        within(log).getAllByText('Why do leaves need light?'),
      ).toHaveLength(1)
      expect(within(log).queryByText('Starting up the tutor')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
