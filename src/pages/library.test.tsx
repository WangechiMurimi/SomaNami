import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderSignedInApp } from '../features/auth/testing/render-app.tsx'
import {
  createConversation,
  createMemoryAdapter,
  createWorkspace,
  getConversation,
  getDocument,
  listWorkspaceDocuments,
  saveDocument,
  setStorageAdapter,
} from '../lib/storage/index.ts'
import type { DocumentKind, Workspace } from '../types/contracts.ts'

let biology: Workspace

const material = (id: string, kind: DocumentKind, workspaceId = biology.id) =>
  saveDocument(
    { id, name: `${id}.${kind}`, size: 1, kind, pageCount: null, chunks: [] },
    workspaceId,
  )

beforeEach(async () => {
  setStorageAdapter(createMemoryAdapter())
  biology = await createWorkspace({ name: 'Biology' })
  await material('cells', 'pdf')
  await material('notes', 'text')
  window.history.pushState({}, '', '/library')
})

const table = () => screen.findByRole('table', { name: 'Your materials' })

describe('Library', () => {
  it('shows each material’s type and workspace', async () => {
    await renderSignedInApp()

    const row = within(await table()).getByRole('row', { name: /cells\.pdf/ })
    expect(row).toHaveTextContent('PDF')
    expect(within(row).getByRole('link', { name: 'Biology' })).toHaveAttribute(
      'href',
      `/workspaces/${biology.id}`,
    )
    expect(
      within(row).getByRole('link', { name: 'Ask about this: cells.pdf' }),
    ).toHaveAttribute(
      'href',
      `/workspaces/${biology.id}/chats/new?material=cells`,
    )
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
    await screen.findByText('✓ Ready to explore')

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
})
