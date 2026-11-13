import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderSignedInApp } from '../features/auth/testing/render-app.tsx'
import {
  createConversation,
  createMemoryAdapter,
  createWorkspace,
  listWorkspaceDocuments,
  listWorkspaces,
  saveDocument,
  setStorageAdapter,
} from '../lib/storage/index.ts'

beforeEach(() => {
  setStorageAdapter(createMemoryAdapter())
  window.history.pushState({}, '', '/')
})

const open = (path: string) => renderSignedInApp(path)

const main = () => within(screen.getByRole('main'))

describe('Workspaces grid', () => {
  it('offers to start a workspace when there are none', async () => {
    await open('/workspaces')

    const list = await main().findByRole('list', { name: 'Your workspaces' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(
      within(list).getByRole('heading', { name: 'Start a new workspace' }),
    ).toBeInTheDocument()
    expect(
      within(list).getByRole('link', { name: 'Create workspace' }),
    ).toHaveAttribute('href', '/workspaces/new')
  })

  it('shows each workspace with its topic and counts', async () => {
    const workspace = await createWorkspace({
      name: 'Memory & learning',
      topic: 'Cognitive psychology',
    })
    await saveDocument(
      {
        id: 'doc-1',
        name: 'Lecture 04.txt',
        size: 1,
        kind: 'text',
        pageCount: null,
        chunks: [],
      },
      workspace.id,
    )
    await createConversation({
      workspaceId: workspace.id,
      materialIds: ['doc-1'],
    })
    await open('/workspaces')

    const card = (
      await main().findByRole('heading', { name: 'Memory & learning' })
    ).closest('li')!
    expect(card).toHaveTextContent('Cognitive psychology')
    expect(card).toHaveTextContent('1 material · 1 chat')
    expect(
      within(card).getByRole('link', { name: 'Open Memory & learning' }),
    ).toHaveAttribute('href', `/workspaces/${workspace.id}`)
  })
})

describe('New workspace', () => {
  const name = () => screen.getByLabelText('Workspace name')
  const next = () => screen.getByRole('button', { name: 'Next' })

  it('asks for a name before moving on', async () => {
    await open('/workspaces/new')

    await userEvent.click(next())

    expect(name()).toHaveAttribute('aria-invalid', 'true')
    expect(name()).toHaveAccessibleDescription('Give your workspace a name.')
    expect(name()).toHaveFocus()
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
  })

  it('goes back to step one with the name kept', async () => {
    await open('/workspaces/new')
    await userEvent.type(name(), 'Biology')
    await userEvent.click(next())

    expect(
      screen.getByRole('heading', {
        name: 'Add the materials it should learn from',
      }),
    ).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(name()).toHaveValue('Biology')
  })

  it('marks the current step for assistive technology', async () => {
    await open('/workspaces/new')
    const steps = within(screen.getByRole('list', { name: 'Steps' }))

    expect(steps.getAllByRole('listitem')[0]).toHaveAttribute(
      'aria-current',
      'step',
    )
    await userEvent.type(name(), 'Biology')
    await userEvent.click(next())
    expect(steps.getAllByRole('listitem')[1]).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(steps.getAllByRole('listitem')[0]).toHaveTextContent(', done')
  })

  it('explains why links cannot be added yet', async () => {
    await open('/workspaces/new')
    await userEvent.type(name(), 'Biology')
    await userEvent.click(next())

    const link = screen.getByRole('button', { name: 'Add a link' })
    expect(link).toBeDisabled()
    expect(link).toHaveAccessibleDescription('Links are coming soon.')
  })

  it('creates the workspace with uploaded and pasted materials, then opens it', async () => {
    await open('/workspaces/new')
    await userEvent.type(name(), 'Biology')
    await userEvent.type(screen.getByLabelText(/Topic/), 'Cells')
    await userEvent.click(next())

    await userEvent.upload(
      screen.getByLabelText('Upload a document'),
      new File(['Mitochondria produce ATP.'], 'cells.txt'),
    )
    await screen.findByText('✓ Ready to explore')

    await userEvent.click(screen.getByRole('button', { name: 'Paste text' }))
    await userEvent.type(screen.getByLabelText(/Title/), 'Seminar notes')
    await userEvent.type(
      screen.getByLabelText('Text'),
      'Ribosomes make proteins.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add text' }))

    const added = within(
      await screen.findByRole('region', { name: 'Added so far' }),
    )
    expect(await added.findByText('Seminar notes.txt')).toBeInTheDocument()
    expect(added.getByText('cells.txt')).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Create workspace' }),
    )

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Biology' }),
    ).toBeInTheDocument()
    const [workspace] = await listWorkspaces()
    expect(workspace).toMatchObject({ name: 'Biology', topic: 'Cells' })
    expect(
      (await listWorkspaceDocuments(workspace!.id)).map(({ name }) => name),
    ).toEqual(['cells.txt', 'Seminar notes.txt'])
  })

  it('leaves out a material removed before creating', async () => {
    await open('/workspaces/new')
    await userEvent.type(name(), 'Biology')
    await userEvent.click(next())
    await userEvent.upload(
      screen.getByLabelText('Upload a document'),
      new File(['Mitochondria produce ATP.'], 'cells.txt'),
    )
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove cells.txt' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Create workspace' }),
    )

    await screen.findByRole('heading', { level: 1, name: 'Biology' })
    const [workspace] = await listWorkspaces()
    expect(await listWorkspaceDocuments(workspace!.id)).toEqual([])
  })

  it('saves nothing when cancelled', async () => {
    await open('/workspaces/new')
    await userEvent.type(name(), 'Biology')

    await userEvent.click(screen.getByRole('link', { name: 'Cancel' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Workspaces' }),
    ).toBeInTheDocument()
    expect(await listWorkspaces()).toEqual([])
  })

  it('says when a workspace address does not exist', async () => {
    await open('/workspaces/nope')

    expect(
      await screen.findByRole('heading', {
        name: 'We can’t find that workspace',
      }),
    ).toBeInTheDocument()
  })
})
