import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderSignedInApp } from '../features/auth/testing/render-app.tsx'
import { uploadOriginal } from '../lib/storage-cloud/originals.ts'
import {
  createConversation,
  createMemoryAdapter,
  createWorkspace,
  DEFAULT_WORKSPACE,
  getConversation,
  getDocument,
  getWorkspace,
  listWorkspaceDocuments,
  listWorkspaces,
  saveDocument,
  setStorageAdapter,
  setWorkspacePinned,
} from '../lib/storage/index.ts'
import { newDoc } from '../lib/storage/testing/documents.ts'
import type { Workspace } from '../types/contracts.ts'

// The app tests' fake Supabase has no Storage; uploads are covered by
// use-library and originals tests, so here only check what gets handed over.
vi.mock('../lib/storage-cloud/originals.ts', async (importOriginal) => ({
  ...(await importOriginal()),
  uploadOriginal: vi.fn(async () => null),
}))

beforeEach(() => {
  vi.mocked(uploadOriginal).mockClear()
  setStorageAdapter(createMemoryAdapter())
  window.history.pushState({}, '', '/')
})

afterEach(() => {
  vi.restoreAllMocks()
})

const open = (path: string) => renderSignedInApp(path)

const main = () => within(screen.getByRole('main'))

describe('Workspaces grid', () => {
  it('names the page in the top bar', async () => {
    await open('/workspaces')

    const trail = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(within(trail).getByText('Workspaces')).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('offers to start a workspace when there are none', async () => {
    await open('/workspaces')

    const list = await main().findByRole('list', { name: 'Your workspaces' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(
      within(list).getByRole('heading', { name: 'Start something new' }),
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
      within(card).getByRole('link', { name: 'Memory & learning' }),
    ).toHaveAttribute('href', `/workspaces/${workspace.id}`)
  })

  it('never lists the default workspace that holds loose chats', async () => {
    await saveDocument({ ...newDoc('loose', { name: 'Loose.txt' }) })
    await createWorkspace({ name: 'Biology' })
    await open('/workspaces')

    const list = await main().findByRole('list', { name: 'Your workspaces' })
    await within(list).findByRole('heading', { name: 'Biology' })
    expect(
      within(list)
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(['Biology', 'Start something new'])
  })

  it('lists pinned workspaces first', async () => {
    await createWorkspace({ name: 'Older' })
    const pinned = await createWorkspace({ name: 'Pinned one' })
    await createWorkspace({ name: 'Newest' })
    await setWorkspacePinned(pinned.id, true)
    await open('/workspaces')

    const list = await main().findByRole('list', { name: 'Your workspaces' })
    await within(list).findByRole('heading', { name: 'Pinned one' })
    const names = within(list)
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
    expect(names[0]).toBe('Pinned one')
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Pinned')
  })
})

describe('Workspace card menu', () => {
  let biology: Workspace

  beforeEach(async () => {
    biology = await createWorkspace({ name: 'Biology' })
  })

  const menuButton = () =>
    main().findByRole('button', { name: 'Actions for Biology' })
  const openMenu = async () => {
    await userEvent.click(await menuButton())
    return within(screen.getByRole('menu', { name: 'Actions for Biology' }))
  }

  it('is a menu button that closes with Escape and returns focus', async () => {
    await open('/workspaces')
    const button = await menuButton()
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    expect(button).toHaveAttribute('aria-expanded', 'false')

    const menu = await openMenu()
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(
      menu.getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual([
      'Open',
      'Add sources',
      'Remove sources',
      'Rename',
      'Pin',
      'Delete',
    ])
    expect(menu.getByRole('menuitem', { name: 'Open' })).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    expect(menu.getByRole('menuitem', { name: 'Add sources' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('opens the workspace', async () => {
    await open('/workspaces')
    const menu = await openMenu()
    await userEvent.click(menu.getByRole('menuitem', { name: 'Open' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Biology' }),
    ).toBeInTheDocument()
  })

  it('pins and unpins the workspace', async () => {
    await open('/workspaces')
    await userEvent.click(
      (await openMenu()).getByRole('menuitem', { name: 'Pin' }),
    )
    await vi.waitFor(async () =>
      expect((await getWorkspace(biology.id))?.pinned).toBe(true),
    )

    const menu = await openMenu()
    await userEvent.click(menu.getByRole('menuitem', { name: 'Unpin' }))
    await vi.waitFor(async () =>
      expect((await getWorkspace(biology.id))?.pinned).toBe(false),
    )
  })

  it('renames the workspace', async () => {
    await open('/workspaces')
    await userEvent.click(
      (await openMenu()).getByRole('menuitem', { name: 'Rename' }),
    )

    const dialog = within(
      screen.getByRole('dialog', { name: 'Rename Biology' }),
    )
    const field = dialog.getByLabelText('Workspace name')
    expect(field).toHaveFocus()
    await userEvent.clear(field)
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(field).toHaveAccessibleDescription('Give your workspace a name.')

    await userEvent.type(field, 'Cell biology')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))

    expect(
      await main().findByRole('heading', { name: 'Cell biology' }),
    ).toBeInTheDocument()
    expect((await getWorkspace(biology.id))?.name).toBe('Cell biology')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks before deleting and says the chats and materials go too', async () => {
    await saveDocument(newDoc('cells', { name: 'Cells.txt' }), biology.id)
    await createConversation({
      workspaceId: biology.id,
      materialIds: ['cells'],
    })
    await open('/workspaces')
    await userEvent.click(
      (await openMenu()).getByRole('menuitem', { name: 'Delete' }),
    )

    const dialog = screen.getByRole('alertdialog', { name: 'Delete Biology?' })
    expect(dialog).toHaveTextContent(
      'This deletes the workspace, its 1 chat and its 1 material.',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )
    expect(await getWorkspace(biology.id)).toBeDefined()

    await userEvent.click(
      (await openMenu()).getByRole('menuitem', { name: 'Delete' }),
    )
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete workspace',
      }),
    )

    await vi.waitFor(async () =>
      expect(await getWorkspace(biology.id)).toBeUndefined(),
    )
    expect(await getDocument('cells')).toBeUndefined()
    expect(
      main().queryByRole('heading', { name: 'Biology' }),
    ).not.toBeInTheDocument()
  })

  it('adds Library files to the workspace', async () => {
    await saveDocument(newDoc('loose', { name: 'Loose notes.txt' }))
    await open('/workspaces')
    await userEvent.click(
      (await openMenu()).getByRole('menuitem', { name: 'Add sources' }),
    )

    const dialog = within(
      screen.getByRole('dialog', { name: 'Add sources to Biology' }),
    )
    expect(dialog.getByLabelText('Upload a document')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('checkbox', { name: /Loose notes/ }))
    await userEvent.click(dialog.getByRole('button', { name: 'Add 1 source' }))

    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect((await getDocument('loose'))?.workspaceId).toBe(biology.id)
    expect(await main().findByText('1 material · 0 chats')).toBeInTheDocument()
  })

  it('removes sources back to My library', async () => {
    await saveDocument(newDoc('cells', { name: 'Cells.txt' }), biology.id)
    await open('/workspaces')
    await userEvent.click(
      (await openMenu()).getByRole('menuitem', { name: 'Remove sources' }),
    )

    const dialog = within(
      screen.getByRole('dialog', { name: 'Remove sources from Biology' }),
    )
    expect(
      screen.getByRole('dialog', { name: 'Remove sources from Biology' }),
    ).toHaveAccessibleDescription(/stay in My library/)
    await userEvent.click(dialog.getByRole('checkbox', { name: /Cells\.txt/ }))
    await userEvent.click(
      dialog.getByRole('button', { name: 'Remove 1 source' }),
    )

    await vi.waitFor(async () =>
      expect((await getDocument('cells'))?.workspaceId).toBe(
        DEFAULT_WORKSPACE.id,
      ),
    )
  })
})

describe('Workspace page', () => {
  let biology: Workspace

  beforeEach(async () => {
    biology = await createWorkspace({
      name: 'Biology',
      topic: 'Cells',
      description: 'Everything about the cell.',
    })
    await saveDocument(newDoc('cells', { name: 'Cells.txt' }), biology.id)
  })

  it('starts with the workspace itself, without intro copy', async () => {
    await open(`/workspaces/${biology.id}`)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Biology' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Everything about the cell.'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/uses only/)).not.toBeInTheDocument()
    expect(screen.queryByText(/offline|on this device/)).not.toBeInTheDocument()
    const trail = within(screen.getByRole('navigation', { name: 'Breadcrumb' }))
    expect(await trail.findByText('Cells')).toBeInTheDocument()
  })

  it('saves and unsaves a chat', async () => {
    const chat = await createConversation({
      workspaceId: biology.id,
      materialIds: ['cells'],
      title: 'What makes ATP?',
    })
    await open(`/workspaces/${biology.id}`)

    const save = await screen.findByRole('button', {
      name: 'Save What makes ATP?',
    })
    expect(save).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(save)
    await vi.waitFor(() => expect(save).toHaveAttribute('aria-pressed', 'true'))
    expect((await getConversation(chat.id))?.saved).toBe(true)

    await userEvent.click(save)
    await vi.waitFor(() =>
      expect(save).toHaveAttribute('aria-pressed', 'false'),
    )
    expect((await getConversation(chat.id))?.saved).toBe(false)
  })

  it('adds and removes sources from its header', async () => {
    await saveDocument(newDoc('loose', { name: 'Loose notes.txt' }))
    await open(`/workspaces/${biology.id}`)

    await userEvent.click(
      await screen.findByRole('button', { name: 'Add sources' }),
    )
    const add = within(screen.getByRole('dialog'))
    await userEvent.click(add.getByRole('checkbox', { name: /Loose notes/ }))
    await userEvent.click(add.getByRole('button', { name: 'Add 1 source' }))
    const materials = within(
      screen.getByRole('region', { name: 'Your materials' }),
    )
    expect(
      await materials.findByLabelText(/Loose notes\.txt/),
    ).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove sources' }),
    )
    const remove = within(screen.getByRole('dialog'))
    await userEvent.click(remove.getByRole('checkbox', { name: /Cells\.txt/ }))
    await userEvent.click(
      remove.getByRole('button', { name: 'Remove 1 source' }),
    )
    await vi.waitFor(() =>
      expect(materials.queryByLabelText(/Cells\.txt/)).not.toBeInTheDocument(),
    )
    expect((await getDocument('cells'))?.workspaceId).toBe(DEFAULT_WORKSPACE.id)
  })

  it('does not open the default workspace as a workspace', async () => {
    await saveDocument(newDoc('loose', { name: 'Loose notes.txt' }))
    await open(`/workspaces/${DEFAULT_WORKSPACE.id}`)

    expect(
      await screen.findByRole('heading', {
        name: 'We can’t find that workspace',
      }),
    ).toBeInTheDocument()
  })
})

describe('New workspace', () => {
  const name = () => screen.getByLabelText('Workspace name')
  const next = () => screen.getByRole('button', { name: 'Continue' })

  it('asks for a name before moving on', async () => {
    await open('/workspaces/new')

    await userEvent.click(next())

    expect(name()).toHaveAttribute('aria-invalid', 'true')
    expect(name()).toHaveAccessibleDescription(/^Give your workspace a name\. /)
    expect(name()).toHaveFocus()
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
  })

  it('shows the trail back to Workspaces in the top bar', async () => {
    await open('/workspaces/new')

    const trail = within(
      await screen.findByRole('navigation', { name: 'Breadcrumb' }),
    )
    expect(trail.getByRole('link', { name: 'Workspaces' })).toHaveAttribute(
      'href',
      '/workspaces',
    )
    expect(trail.getByText('Create a workspace')).toHaveAttribute(
      'aria-current',
      'page',
    )
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

  it('states the source limit once, without privacy or offline claims', async () => {
    await open('/workspaces/new')
    await userEvent.type(name(), 'Biology')
    await userEvent.click(next())

    expect(
      screen.getByText(/Chats here answer only from what you add/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Locked to your content/)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/offline|private|Nothing outside/i),
    ).not.toBeInTheDocument()
  })

  it('adds a material from a link and keeps where it came from', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Photosynthesis makes sugar from light.', {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': "attachment; filename*=UTF-8''leaves.txt",
          'X-Final-Url': 'https://example.org/leaves.txt',
        },
      }),
    )
    await open('/workspaces/new')
    await userEvent.type(name(), 'Biology')
    await userEvent.click(next())

    await userEvent.click(screen.getByRole('button', { name: 'Add a link' }))
    await userEvent.type(screen.getByLabelText('Link'), 'example.org/leaves')
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }))

    const added = within(
      await screen.findByRole('region', { name: 'Added so far' }),
    )
    expect(await added.findByText('leaves.txt')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/fetch-link',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.org/leaves' }),
      }),
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Create workspace' }),
    )
    await screen.findByRole('heading', { level: 1, name: 'Biology' })
    const [workspace] = await listWorkspaces()
    const [material] = await listWorkspaceDocuments(workspace!.id)
    expect(material).toMatchObject({
      name: 'leaves.txt',
      sourceUrl: 'https://example.org/leaves.txt',
    })
  })

  it('explains a link that could not be fetched, with a fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ error: 'login-or-paywall' }, { status: 502 }),
    )
    await open('/workspaces/new')
    await userEvent.type(name(), 'Biology')
    await userEvent.click(next())

    await userEvent.click(screen.getByRole('button', { name: 'Add a link' }))
    await userEvent.type(
      screen.getByLabelText('Link'),
      'https://news.example.com/story',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /needs a sign-in or subscription.*Paste text instead/,
    )
    expect(
      screen.queryByRole('region', { name: 'Added so far' }),
    ).not.toBeInTheDocument()
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
    await screen.findByText('✓ Added')

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
    // Each buffered original goes up with the material it was parsed into.
    const documents = await listWorkspaceDocuments(workspace!.id)
    expect(
      vi.mocked(uploadOriginal).mock.calls.map(([id, file]) => [id, file.name]),
    ).toEqual(documents.map(({ id, name }) => [id, name]))
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
      await screen.findByRole('heading', { level: 1, name: 'Your workspaces' }),
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
