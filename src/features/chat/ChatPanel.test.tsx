import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatPanel from './ChatPanel.tsx'
import { askQuestion, ChatError } from './chat-client.ts'
import type { ChatReply } from '../../types/contracts.ts'

vi.mock('./chat-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chat-client.ts')>()),
  askQuestion: vi.fn(),
}))

const PASSAGES = [
  {
    documentId: 'doc-1',
    chunkId: 2,
    text: 'Light drives photosynthesis.',
    source: { type: 'page' as const, page: 4 },
  },
]

function setup() {
  const user = userEvent.setup()
  render(
    <ChatPanel
      documents={[{ id: 'doc-1', name: 'biology.pdf' }]}
      selectPassages={() => PASSAGES}
    />,
  )
  return {
    user,
    box: screen.getByLabelText('Ask a question about your documents'),
    send: screen.getByRole('button', { name: 'Ask' }),
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

    const log = screen.getByRole('log', { name: 'Conversation' })
    expect(within(log).getByText('Why do leaves need light?')).toBeVisible()
    expect(within(log).getByText('Reading your documents…')).toBeVisible()
    expect(log).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Asking…' })).toBeDisabled()
    expect(box).toHaveValue('')

    settle({
      answer: 'Light drives photosynthesis.',
      citations: [{ documentId: 'doc-1', chunkId: 2 }],
      answerable: true,
    })

    const reply = await screen.findByRole('article', { name: 'Answer' })
    expect(within(reply).getByText('From your documents')).toBeVisible()
    expect(within(reply).getByText('biology.pdf · Page 4')).toBeVisible()
    await waitFor(() =>
      expect(
        screen.queryByText('Reading your documents…'),
      ).not.toBeInTheDocument(),
    )
    expect(log).toHaveAttribute('aria-busy', 'false')
  })

  it('submits on Enter and keeps Shift+Enter for a newline', async () => {
    vi.mocked(askQuestion).mockResolvedValue({
      answer: 'Yes.',
      citations: [],
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
      answerable: false,
    })
    const { user, box, send } = setup()

    await user.type(box, 'What is the tax rate?')
    await user.click(send)

    const reply = await screen.findByRole('article', {
      name: 'Unanswered question',
    })
    expect(
      within(reply).getByText('Not answered from your documents'),
    ).toBeVisible()
    expect(within(reply).getByText(/don’t say enough to answer/)).toBeVisible()
    expect(screen.queryByText('From your documents')).not.toBeInTheDocument()
  })

  it('flags an answer with no citations as ungrounded', async () => {
    vi.mocked(askQuestion).mockResolvedValue({
      answer: 'Here is an analogy.',
      citations: [],
      answerable: true,
    })
    const { user, box, send } = setup()

    await user.type(box, 'Explain it simply')
    await user.click(send)

    expect(
      await screen.findByText(/no passage from your documents behind it/),
    ).toBeVisible()
  })

  it('shows a failed request as an alert with a working retry', async () => {
    vi.mocked(askQuestion).mockRejectedValueOnce(
      new ChatError('We couldn’t reach the answer service.', {
        code: 'offline',
      }),
    )
    const { user, box, send } = setup()

    await user.type(box, 'Why?')
    await user.click(send)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('We couldn’t reach the answer service.')

    vi.mocked(askQuestion).mockResolvedValueOnce({
      answer: 'Light drives photosynthesis.',
      citations: [],
      answerable: true,
    })
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('article', { name: 'Answer' })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // The question was not duplicated by the retry.
    expect(screen.getAllByText('Why?')).toHaveLength(1)
  })
})
