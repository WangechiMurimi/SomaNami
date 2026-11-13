import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatPanel from './ChatPanel.tsx'
import { askQuestion, ChatError } from './chat-client.ts'
import type { ChatTurn } from './use-chat.ts'
import { AuthContext } from '../auth/auth-context.ts'
import type { AuthContextValue, AuthStatus } from '../../types/auth.ts'
import type { ChatReply } from '../../types/contracts.ts'

vi.mock('./chat-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chat-client.ts')>()),
  askQuestion: vi.fn(),
}))

const PASSAGES = [
  {
    documentId: 'doc-1',
    chunkId: 'doc-1:2',
    text: 'Light drives photosynthesis.',
    source: { type: 'page' as const, page: 4 },
  },
]

/** Only `status` matters to the panel; the account actions are never called. */
const authAs = (status: AuthStatus) =>
  ({
    status,
    user: { id: 'user-1', email: 'learner@example.test' },
  }) as AuthContextValue

function setup({
  status = 'signed-in',
  initialMessages,
}: { status?: AuthStatus; initialMessages?: ChatTurn[] } = {}) {
  const user = userEvent.setup()
  render(
    <AuthContext.Provider value={authAs(status)}>
      <ChatPanel
        documents={[{ id: 'doc-1', name: 'biology.pdf' }]}
        selectPassages={() => PASSAGES}
        initialMessages={initialMessages}
      />
    </AuthContext.Provider>,
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

    expect(
      await screen.findByRole('article', {
        name: 'Answer from your materials',
      }),
    ).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // The question was not duplicated by the retry.
    expect(screen.getAllByText('Why?')).toHaveLength(1)
  })

  describe('while signed in offline', () => {
    const saved: ChatTurn[] = [
      { id: 'q', role: 'user', content: 'What is ATP?' },
      {
        id: 'a',
        role: 'assistant',
        content: 'The cell’s energy currency.',
        answerable: true,
        citations: [],
      },
    ]

    it('keeps the saved conversation readable', () => {
      setup({ status: 'signed-in-offline', initialMessages: saved })

      const log = screen.getByRole('log', { name: 'Conversation' })
      expect(within(log).getByText('What is ATP?')).toBeVisible()
      expect(within(log).getByText('The cell’s energy currency.')).toBeVisible()
    })

    it('explains that asking needs a connection, and blocks sending', async () => {
      const { user, box, send } = setup({ status: 'signed-in-offline' })

      expect(
        screen.getByText('You’re offline. Reconnect to ask questions.'),
      ).toBeVisible()
      expect(box).toBeDisabled()
      expect(send).toBeDisabled()

      await user.type(box, 'Why?{Enter}')
      expect(askQuestion).not.toHaveBeenCalled()
    })

    it('says nothing about being offline when online', () => {
      setup()

      expect(screen.queryByText(/You’re offline/)).not.toBeInTheDocument()
    })
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
})
