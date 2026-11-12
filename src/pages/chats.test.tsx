import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.tsx'
import {
  appendMessage,
  createConversation,
  createMemoryAdapter,
  createWorkspace,
  listWorkspaceConversations,
  listWorkspaceDocuments,
  saveDocument,
  setStorageAdapter,
} from '../lib/storage/index.ts'
import type { ChatReply, ChatRequest, Workspace } from '../types/contracts.ts'

let workspace: Workspace

const material = (id: string, name: string, text: string) =>
  saveDocument(
    {
      id,
      name,
      size: text.length,
      kind: 'text',
      pageCount: null,
      chunks: [
        {
          id: `${id}:0`,
          text,
          source: { type: 'line', startLine: 1, endLine: 1 },
        },
      ],
    },
    workspace.id,
  )

beforeEach(async () => {
  setStorageAdapter(createMemoryAdapter())
  window.history.pushState({}, '', '/')
  workspace = await createWorkspace({ name: 'Biology', topic: 'Cells' })
  await material('cells', 'cells.txt', 'Mitochondria produce ATP for the cell.')
  await material('plants', 'plants.txt', 'Chloroplasts capture light energy.')
})

afterEach(() => vi.restoreAllMocks())

const open = (path: string) => {
  window.history.pushState({}, '', path)
  return render(<App />)
}

/** Answers every /api/chat call with its first passage, recording requests. */
function serveChat() {
  const requests: ChatRequest[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as ChatRequest
    requests.push(request)
    const reply: ChatReply = {
      answer: 'From your notes.',
      answerable: true,
      citations: request.passages.slice(0, 1),
    }
    return Response.json(reply)
  })
  return requests
}

const picker = async () =>
  within(await screen.findByRole('group', { name: 'Materials for this chat' }))
const question = () =>
  screen.getByLabelText('Ask a question about your materials')
const send = () => screen.getByRole('button', { name: 'Send' })

describe('Workspace page', () => {
  it('lists the workspace’s materials and chats', async () => {
    const chat = await createConversation({
      workspaceId: workspace.id,
      materialIds: ['cells'],
      title: 'What makes ATP?',
    })
    open(`/workspaces/${workspace.id}`)

    const materials = within(
      await screen.findByRole('region', { name: /Materials/ }),
    )
    expect(materials.getByText('cells.txt')).toBeInTheDocument()
    expect(
      materials.getByRole('link', { name: 'Ask about this: plants.txt' }),
    ).toHaveAttribute(
      'href',
      `/workspaces/${workspace.id}/chats/new?material=plants`,
    )
    expect(
      materials.getByText(/only see these 2 materials/),
    ).toBeInTheDocument()

    const chats = within(screen.getByRole('region', { name: 'Chats' }))
    expect(
      await chats.findByRole('link', { name: /What makes ATP\?.*Continue/ }),
    ).toHaveAttribute('href', `/chats/${chat.id}`)
  })

  it('adds pasted text to this workspace', async () => {
    open(`/workspaces/${workspace.id}`)

    await userEvent.click(
      await screen.findByRole('button', { name: 'Add materials' }),
    )
    const panel = within(screen.getByRole('region', { name: 'Add materials' }))
    await userEvent.click(panel.getByRole('button', { name: 'Paste text' }))
    await userEvent.type(panel.getByLabelText(/Title/), 'Seminar')
    await userEvent.type(
      panel.getByLabelText('Text'),
      'Ribosomes make proteins.',
    )
    await userEvent.click(panel.getByRole('button', { name: 'Add text' }))

    expect(
      await within(
        screen.getByRole('region', { name: /Materials/ }),
      ).findByText('Seminar.txt'),
    ).toBeInTheDocument()
    expect(
      (await listWorkspaceDocuments(workspace.id)).map(({ name }) => name),
    ).toContain('Seminar.txt')
  })

  it('asks a question over every material from its composer', async () => {
    const requests = serveChat()
    open(`/workspaces/${workspace.id}`)

    await userEvent.type(
      await screen.findByLabelText('Ask about Biology'),
      'What do chloroplasts capture?{Enter}',
    )

    expect(await screen.findByText('From your notes.')).toBeInTheDocument()
    const [chat] = await listWorkspaceConversations(workspace.id)
    expect(chat?.materialIds.sort()).toEqual(['cells', 'plants'])
    expect(requests[0]?.passages.map((p) => p.documentId)).toEqual(['plants'])
  })
})

describe('New chat', () => {
  it('starts with the material it was opened from', async () => {
    open(`/workspaces/${workspace.id}/chats/new?material=plants`)
    const materials = await picker()

    expect(
      materials.getByRole('button', { name: 'plants.txt' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      materials.getByRole('button', { name: 'cells.txt' }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByText('This chat will use 1 of 2 materials.'),
    ).toBeInTheDocument()
  })

  it('needs at least one material and a question before it can send', async () => {
    open(`/workspaces/${workspace.id}/chats/new?material=plants`)
    const materials = await picker()

    await userEvent.click(materials.getByRole('button', { name: 'plants.txt' }))
    await userEvent.type(question(), 'Why?')

    expect(send()).toBeDisabled()
    expect(send()).toHaveAccessibleDescription(
      'Choose at least one material to start.',
    )
  })

  it('fills the question from a way of understanding', async () => {
    open(`/workspaces/${workspace.id}/chats/new`)
    await picker()

    await userEvent.click(
      screen.getByRole('button', { name: /Find your explanation/ }),
    )
    expect(question()).toHaveValue(
      'Explain the key idea simply, with an everyday analogy.',
    )
  })

  it('answers only from the chosen materials (US-08 AC3)', async () => {
    const requests = serveChat()
    open(`/workspaces/${workspace.id}/chats/new?material=cells`)
    await picker()

    // The question matches plants.txt, which this chat did not choose.
    await userEvent.type(question(), 'What do chloroplasts capture?{Enter}')

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'What do chloroplasts capture?',
      }),
    ).toBeInTheDocument()
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]?.passages).toEqual([])
    expect(
      within(screen.getByRole('list', { name: 'Materials this chat uses' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['cells.txt'])
  })
})

describe('Chat', () => {
  it('offers to add material when a question goes unanswered', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        answer: 'Your materials don’t cover this.',
        answerable: false,
        citations: [],
      } satisfies ChatReply),
    )
    open(`/workspaces/${workspace.id}/chats/new?material=cells`)
    await picker()

    await userEvent.type(question(), 'Who discovered ATP?{Enter}')

    const reply = await screen.findByRole('article', {
      name: 'Not answered from your materials',
    })
    expect(
      within(reply).getByRole('link', { name: 'add material that covers it' }),
    ).toHaveAttribute('href', `/workspaces/${workspace.id}`)
  })
})

describe('Chat addresses', () => {
  it('says when a chat is not on this device', async () => {
    open('/chats/nope')

    expect(
      await screen.findByRole('heading', { name: 'We can’t find that chat' }),
    ).toBeInTheDocument()
  })

  it('sends an old material link to that material’s latest chat', async () => {
    const chat = await createConversation({
      workspaceId: workspace.id,
      materialIds: ['cells'],
      title: 'Saved chat',
    })
    await appendMessage({
      conversationId: chat.id,
      role: 'user',
      content: 'An earlier question',
    })
    open('/chat/cells')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Saved chat' }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe(`/chats/${chat.id}`)
  })

  it('sends an old material link without chats to New chat', async () => {
    open('/chat/plants')

    const materials = await picker()
    expect(
      materials.getByRole('button', { name: 'plants.txt' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })
})
