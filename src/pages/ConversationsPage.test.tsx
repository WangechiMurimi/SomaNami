import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderSignedInApp } from '../features/auth/testing/render-app.tsx'
import {
  createConversation,
  createMemoryAdapter,
  createWorkspace,
  DEFAULT_WORKSPACE,
  listSavedConversations,
  saveDocument,
  setConversationSaved,
  setStorageAdapter,
} from '../lib/storage/index.ts'
import type { NewDocument } from '../types/contracts.ts'

const doc = (id: string): NewDocument => ({
  id,
  name: `${id}.txt`,
  size: 1,
  kind: 'text',
  pageCount: null,
  chunks: [],
})

const main = () => within(screen.getByRole('main'))
const savedList = () => main().findByRole('list', { name: 'Saved chats' })

beforeEach(async () => {
  setStorageAdapter(createMemoryAdapter())
  const biology = await createWorkspace({ name: 'Biology' })
  await saveDocument(doc('cells'), biology.id)
  await saveDocument(doc('loose'))
  const inWorkspace = await createConversation({
    workspaceId: biology.id,
    materialIds: ['cells'],
    title: 'What makes ATP?',
  })
  const loose = await createConversation({
    workspaceId: DEFAULT_WORKSPACE.id,
    materialIds: ['loose'],
    title: 'loose.txt',
  })
  await createConversation({
    workspaceId: biology.id,
    materialIds: ['cells'],
    title: 'Not saved',
  })
  await setConversationSaved(inWorkspace.id, true)
  await setConversationSaved(loose.id, true)
})

describe('Saved conversations', () => {
  it('lists saved chats from Recents and from workspaces, and only those', async () => {
    await renderSignedInApp('/conversations')

    const list = within(await savedList())
    const items = list.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    const workspaceChat = list
      .getByRole('link', { name: 'What makes ATP?' })
      .closest('li')!
    expect(workspaceChat).toHaveTextContent('Biology')
    const looseChat = list
      .getByRole('link', { name: 'loose.txt' })
      .closest('li')!
    expect(looseChat).toHaveTextContent('Recents')
    expect(list.queryByText('Not saved')).not.toBeInTheDocument()
    expect(main().getByText('2 conversations · newest first')).toBeVisible()
  })

  it('opens a saved chat', async () => {
    await renderSignedInApp('/conversations')

    const link = within(await savedList()).getByRole('link', {
      name: 'What makes ATP?',
    })
    expect(link.getAttribute('href')).toMatch(/^\/chats\//)
  })

  it('unsaves a chat', async () => {
    await renderSignedInApp('/conversations')

    await userEvent.click(
      within(await savedList()).getByRole('button', {
        name: 'Unsave: What makes ATP?',
      }),
    )

    await vi.waitFor(() =>
      expect(main().queryByText('What makes ATP?')).not.toBeInTheDocument(),
    )
    expect((await listSavedConversations()).map(({ title }) => title)).toEqual([
      'loose.txt',
    ])
  })

  it('filters by title and by where the chat lives', async () => {
    await renderSignedInApp('/conversations')
    await savedList()

    await userEvent.type(main().getByLabelText('Search by title'), 'atp')
    expect(within(await savedList()).getAllByRole('listitem')).toHaveLength(1)

    await userEvent.clear(main().getByLabelText('Search by title'))
    await userEvent.selectOptions(main().getByLabelText('Workspace'), 'Recents')
    const list = within(await savedList())
    expect(list.getAllByRole('listitem')).toHaveLength(1)
    expect(list.getByRole('link', { name: 'loose.txt' })).toBeInTheDocument()
  })

  it('explains the empty state', async () => {
    setStorageAdapter(createMemoryAdapter())
    await renderSignedInApp('/conversations')

    expect(
      await main().findByRole('heading', { name: 'No saved chats yet' }),
    ).toBeInTheDocument()
    expect(main().queryByText(/offline/)).not.toBeInTheDocument()
  })

  it('never offers the default workspace by name', async () => {
    await renderSignedInApp('/conversations')
    await savedList()

    const options = within(main().getByLabelText('Workspace'))
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(options).toEqual(['All', 'Recents', 'Biology'])
  })
})
