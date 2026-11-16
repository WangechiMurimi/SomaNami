import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderSignedInApp } from '../features/auth/testing/render-app.tsx'
import {
  createConversation,
  createMemoryAdapter,
  createWorkspace,
  DEFAULT_WORKSPACE,
  getConversation,
  getDocument,
  listWorkspaceDocuments,
  saveDocument,
  setStorageAdapter,
} from '../lib/storage/index.ts'
import { syncOnce } from '../lib/sync/engine.ts'
import type { DocumentKind, Workspace } from '../types/contracts.ts'

// The cloud's answer is each test's to decide; by default it confirms
// everything, as a reachable cloud would.
vi.mock('../lib/sync/engine.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/sync/engine.ts')>()),
  syncOnce: vi.fn(),
}))

let biology: Workspace

const material = (id: string, kind: DocumentKind, workspaceId = biology.id) =>
  saveDocument(
    { id, name: `${id}.${kind}`, size: 1, kind, pageCount: null, chunks: [] },
    workspaceId,
  )

beforeEach(async () => {
  vi.mocked(syncOnce).mockResolvedValue({ pulled: 0, pushed: 0, pending: 0 })
  setStorageAdapter(createMemoryAdapter())
  biology = await createWorkspace({ name: 'Biology' })
  await material('cells', 'pdf')
  await material('notes', 'text')
  window.history.pushState({}, '', '/library')
})

const table = () => screen.findByRole('table', { name: 'Your materials' })

describe('Library', () => {
  it('names the page in the top bar’s breadcrumb', async () => {
    await renderSignedInApp()
    const trail = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    await within(trail).findByText('My library')
  })

  it('offers the real file types as filters', async () => {
    await renderSignedInApp()
    await table()
    const filters = within(
      screen.getByRole('group', { name: 'Filter by type' }),
    )
    expect(filters.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'All',
      'PDF',
      'Word',
      'Text',
      'Web',
    ])
  })

  it('shows each material’s type and workspace', async () => {
    await renderSignedInApp()

    const row = within(await table()).getByRole('row', { name: /cells\.pdf/ })
    expect(row).toHaveTextContent('PDF')
    expect(within(row).getByRole('link', { name: 'Biology' })).toHaveAttribute(
      'href',
      `/workspaces/${biology.id}`,
    )
    expect(screen.queryByText(/Ask about this/)).not.toBeInTheDocument()
  })

  it('never names the default workspace', async () => {
    await material('loose', 'text', DEFAULT_WORKSPACE.id)
    await renderSignedInApp()

    const row = within(await table()).getByRole('row', { name: /loose\.text/ })
    expect(row).toHaveTextContent('Not in a workspace')
    expect(row).not.toHaveTextContent(DEFAULT_WORKSPACE.name)
    const options = within(screen.getByLabelText('Add to workspace'))
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(options).toEqual(['No workspace', 'Biology'])
  })

  it('starts a chat with a file when it is clicked', async () => {
    await renderSignedInApp()

    await userEvent.click(
      within(await table()).getByRole('button', { name: /^cells\.pdf/ }),
    )

    await vi.waitFor(() =>
      expect(window.location.pathname).toMatch(/^\/chats\/./),
    )
    const id = window.location.pathname.split('/').pop()!
    expect(await getConversation(id)).toMatchObject({
      workspaceId: DEFAULT_WORKSPACE.id,
      materialIds: ['cells'],
      title: 'cells.pdf',
    })
  })

  it('starts a chat when the row itself is clicked', async () => {
    await renderSignedInApp()

    const row = within(await table()).getByRole('row', { name: /notes\.text/ })
    await userEvent.click(within(row).getByText('Text'))

    await vi.waitFor(() =>
      expect(window.location.pathname).toMatch(/^\/chats\/./),
    )
  })

  it('searches conversations and file names, grouped', async () => {
    await createConversation({
      workspaceId: biology.id,
      materialIds: ['cells'],
      title: 'How do cells divide?',
    })
    await createConversation({
      workspaceId: biology.id,
      materialIds: ['notes'],
      title: 'Photosynthesis',
    })
    await renderSignedInApp()
    await table()

    const search = screen.getByRole('searchbox', {
      name: 'Search your library',
    })
    await userEvent.type(search, 'cell')

    const conversations = within(
      screen.getByRole('region', { name: 'Conversations' }),
    )
    expect(
      conversations.getByRole('link', { name: /How do cells divide\?/ }),
    ).toHaveTextContent('Biology')
    expect(conversations.queryByText('Photosynthesis')).not.toBeInTheDocument()
    const files = within(screen.getByRole('region', { name: 'Files' }))
    expect(files.getAllByRole('row')).toHaveLength(2) // header + cells
    expect(files.getByRole('row', { name: /cells\.pdf/ })).toBeInTheDocument()

    await userEvent.clear(search)
    await userEvent.type(search, 'zzz')
    expect(screen.getByText('No conversations match.')).toBeInTheDocument()
    expect(screen.getByText('No files match.')).toBeInTheDocument()
  })

  it('filters by type and says how many are shown', async () => {
    await renderSignedInApp()
    await table()
    const filters = within(
      screen.getByRole('group', { name: 'Filter by type' }),
    )

    await userEvent.click(filters.getByRole('button', { name: 'Text' }))

    expect(filters.getByRole('button', { name: 'Text' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('Showing 1 of 2')).toBeInTheDocument()
    const rows = within(await table()).getAllByRole('row')
    expect(rows).toHaveLength(2) // header + notes
    expect(rows[1]).toHaveTextContent('notes.text')
  })

  it('uploads into the chosen workspace', async () => {
    await renderSignedInApp()
    await userEvent.selectOptions(
      await screen.findByLabelText('Add to workspace'),
      'Biology',
    )

    await userEvent.upload(
      screen.getByLabelText('Upload a document'),
      new File(['Ribosomes make proteins.'], 'ribosomes.txt'),
    )
    await screen.findByText('✓ Added')

    expect(
      (await listWorkspaceDocuments(biology.id)).map(({ name }) => name),
    ).toContain('ribosomes.txt')
  })
})

describe('Removing a material (US-08 AC5)', () => {
  const removeButton = async (name: string) =>
    within(await table()).getByRole('button', { name: `Remove ${name}` })

  it('explains what happens to the chats that use it', async () => {
    await createConversation({
      workspaceId: biology.id,
      materialIds: ['cells'],
    })
    await createConversation({
      workspaceId: biology.id,
      materialIds: ['cells', 'notes'],
    })
    await renderSignedInApp()

    await userEvent.click(await removeButton('cells.pdf'))

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Remove cells.pdf?',
    })
    expect(
      await within(dialog).findByText(/1 chat that only used this material/),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(/1 chat that also uses other materials/),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('keeps everything when cancelled, and returns focus', async () => {
    await renderSignedInApp()
    const button = await removeButton('cells.pdf')

    await userEvent.click(button)
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
    expect(await getDocument('cells')).toBeDefined()
  })

  it('removes the material and the chats that only used it', async () => {
    const solo = await createConversation({
      workspaceId: biology.id,
      materialIds: ['cells'],
    })
    const shared = await createConversation({
      workspaceId: biology.id,
      materialIds: ['cells', 'notes'],
    })
    await renderSignedInApp()

    await userEvent.click(await removeButton('cells.pdf'))
    const dialog = await screen.findByRole('alertdialog')
    await within(dialog).findByText(/only used this material/)
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove' }),
    )

    await vi.waitFor(async () =>
      expect(await getDocument('cells')).toBeUndefined(),
    )
    expect(
      within(await table()).queryByRole('row', { name: /cells\.pdf/ }),
    ).not.toBeInTheDocument()
    expect(await getConversation(solo.id)).toBeUndefined()
    expect((await getConversation(shared.id))?.materialIds).toEqual(['notes'])
  })

  const removeCells = async () => {
    await renderSignedInApp()
    await userEvent.click(await removeButton('cells.pdf'))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(
      /deleted from your account and all your devices, original file included/,
    )
    await within(dialog).findByRole('button', { name: 'Remove' })
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove' }),
    )
  }

  it('says it was deleted once the cloud confirms (#147)', async () => {
    await removeCells()

    expect(await screen.findByText('‘cells.pdf’ deleted')).toHaveAttribute(
      'role',
      'status',
    )
    expect(syncOnce).toHaveBeenCalled()
  })

  it('says exactly what happened when the cloud can’t confirm yet', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await renderSignedInApp()
    // Let the sync that runs on opening finish before the cloud goes away.
    await vi.waitFor(() => expect(syncOnce).toHaveBeenCalled())
    vi.mocked(syncOnce).mockRejectedValue(new Error('offline'))

    await userEvent.click(await removeButton('cells.pdf'))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Remove' }),
    )

    expect(
      await screen.findByText(
        '‘cells.pdf’ is removed from your library. We couldn’t reach SomaNami to erase it from your account yet; we’ll finish as soon as we can.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('‘cells.pdf’ deleted')).toBeNull()
    expect(screen.queryByText(/this device|online/)).toBeNull()
    expect(await getDocument('cells')).toBeUndefined()
  })
})
