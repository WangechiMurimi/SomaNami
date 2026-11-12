import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../../App.tsx'
import {
  createMemoryAdapter,
  createWorkspace,
  DEFAULT_WORKSPACE,
  listWorkspaceDocuments,
  saveDocument,
  setStorageAdapter,
} from '../../lib/storage/index.ts'

beforeEach(() => {
  setStorageAdapter(createMemoryAdapter())
  window.history.pushState({}, '', '/')
})

const material = (id: string, workspaceId: string) =>
  saveDocument(
    {
      id,
      name: `${id}.txt`,
      size: 1,
      kind: 'text',
      pageCount: null,
      chunks: [],
    },
    workspaceId,
  )

const start = () => within(screen.getByRole('region', { name: 'Start a chat' }))
const question = () =>
  start().getByLabelText('Ask a question or share what you’re reading')
const send = () => start().getByRole('button', { name: 'Send' })

describe('Home quick start', () => {
  it('explains that a material is needed before asking', async () => {
    render(<App />)
    await userEvent.type(question(), 'Why?')

    expect(send()).toBeDisabled()
    expect(send()).toHaveAccessibleDescription(
      'Add a material first, so there’s something to answer from.',
    )
  })

  it('uploads from the composer into the default workspace', async () => {
    const { container } = render(<App />)
    const picker =
      container.querySelector<HTMLInputElement>('input[type="file"]')!

    await userEvent.upload(picker, new File(['Cells divide.'], 'cells.txt'))

    expect(
      await start().findByRole('link', { name: 'Ask about this' }),
    ).toHaveAttribute(
      'href',
      expect.stringMatching(`^/workspaces/${DEFAULT_WORKSPACE.id}/chats/new`),
    )
    expect(
      (await listWorkspaceDocuments(DEFAULT_WORKSPACE.id)).map(
        ({ name }) => name,
      ),
    ).toEqual(['cells.txt'])
  })

  it('adds pasted text as a material', async () => {
    render(<App />)

    await userEvent.click(start().getByRole('button', { name: 'Paste text' }))
    await userEvent.type(
      start().getByLabelText('Text'),
      'Ribosomes make proteins.',
    )
    await userEvent.click(start().getByRole('button', { name: 'Add text' }))

    expect(await start().findByText('✓ Ready to explore')).toBeInTheDocument()
    expect(
      (await listWorkspaceDocuments(DEFAULT_WORKSPACE.id)).map(
        ({ name }) => name,
      ),
    ).toEqual(['Pasted text.txt'])
  })

  it('opens New chat in the only workspace that has materials', async () => {
    const biology = await createWorkspace({ name: 'Biology' })
    await material('cells', biology.id)
    await createWorkspace({ name: 'Empty' })
    render(<App />)

    await userEvent.type(question(), 'What do cells do?{Enter}')

    expect(
      await screen.findByRole('heading', {
        name: 'What would you like to understand?',
      }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe(`/workspaces/${biology.id}/chats/new`)
    expect(
      screen.getByLabelText('Ask a question about your materials'),
    ).toHaveValue('What do cells do?')
  })

  it('asks which workspace to use when several have materials', async () => {
    const biology = await createWorkspace({ name: 'Biology' })
    const history = await createWorkspace({ name: 'History', topic: 'Rome' })
    await material('cells', biology.id)
    await material('rome', history.id)
    render(<App />)

    await userEvent.type(question(), 'Who built the roads?{Enter}')
    const choice = within(
      await start().findByRole('group', {
        name: 'Which workspace should this chat use?',
      }),
    )
    await userEvent.click(choice.getByRole('radio', { name: /History/ }))
    await userEvent.click(start().getByRole('button', { name: 'Continue' }))

    expect(
      await screen.findByRole('heading', {
        name: 'What would you like to understand?',
      }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe(`/workspaces/${history.id}/chats/new`)
    expect(
      screen.getByLabelText('Ask a question about your materials'),
    ).toHaveValue('Who built the roads?')
  })

  it('points the first step’s upload link at the composer', () => {
    render(<App />)

    expect(
      screen.getByRole('link', { name: 'Upload materials' }),
    ).toHaveAttribute('href', '#start')
  })
})
