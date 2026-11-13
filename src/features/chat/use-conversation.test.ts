import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appendMessage,
  createConversation,
  createMemoryAdapter,
  DEFAULT_WORKSPACE,
  listMessages,
  saveDocument,
  setStorageAdapter,
} from '../../lib/storage/index.ts'
import type { StoredDocument } from '../../types/contracts.ts'
import {
  chatPath,
  materialsFor,
  newChatPath,
  titleFrom,
  toChatTurns,
  toPassages,
} from './conversation-materials.ts'
import { useConversation } from './use-conversation.ts'

const document: StoredDocument = {
  id: 'doc-1',
  workspaceId: DEFAULT_WORKSPACE.id,
  name: 'biology.pdf',
  size: 10,
  kind: 'pdf',
  pageCount: 2,
  chunks: [
    {
      id: 'doc-1:0',
      text: 'Mitochondria produce ATP.',
      source: { type: 'page', page: 2 },
    },
  ],
}

const reply = {
  answer: 'They produce ATP.',
  answerable: true,
  citations: [{ documentId: 'doc-1', chunkId: 'doc-1:0' }],
}

// The document is stored first: a conversation may only use stored materials.
beforeEach(async () => {
  setStorageAdapter(createMemoryAdapter())
  await saveDocument(document)
})

describe('materialsFor', () => {
  const other = { ...document, id: 'doc-2', name: 'other.pdf' }
  const elsewhere = { ...document, id: 'doc-3', workspaceId: 'history' }

  it('keeps only the materials the conversation chose', () => {
    const chosen = materialsFor(
      { workspaceId: DEFAULT_WORKSPACE.id, materialIds: ['doc-1'] },
      [document, other],
    )
    expect(chosen.map(({ id }) => id)).toEqual(['doc-1'])
  })

  it('never returns a material from another workspace (US-08 AC3)', () => {
    const chosen = materialsFor(
      { workspaceId: DEFAULT_WORKSPACE.id, materialIds: ['doc-1', 'doc-3'] },
      [document, elsewhere],
    )
    expect(chosen.map(({ id }) => id)).toEqual(['doc-1'])
  })
})

describe('toPassages', () => {
  it('turns every chunk of every material into a citable passage', () => {
    expect(toPassages([document])).toEqual([
      {
        documentId: 'doc-1',
        chunkId: 'doc-1:0',
        text: 'Mitochondria produce ATP.',
        source: { type: 'page', page: 2 },
      },
    ])
  })
})

describe('toChatTurns', () => {
  it('resolves stored citations against the materials', () => {
    const turns = toChatTurns(
      [
        {
          id: 'a1',
          conversationId: 'c1',
          role: 'assistant',
          content: 'They produce ATP.',
          citations: [{ documentId: 'doc-1', chunkId: 'doc-1:0' }],
          answerable: true,
          createdAt: 1,
        },
      ],
      [document],
    )

    expect(turns).toEqual([
      {
        id: 'a1',
        role: 'assistant',
        content: 'They produce ATP.',
        answerable: true,
        citations: [
          {
            key: 'doc-1:0',
            label: 'biology.pdf · Page 2',
            text: 'Mitochondria produce ATP.',
          },
        ],
      },
    ])
  })
})

describe('paths and titles', () => {
  it('builds chat addresses', () => {
    expect(chatPath({ id: 'c1' })).toBe('/chats/c1')
    expect(newChatPath('w1')).toBe('/workspaces/w1/chats/new')
    expect(newChatPath('w1', 'a b')).toBe(
      '/workspaces/w1/chats/new?material=a%20b',
    )
  })

  it('titles a chat by its first question, shortened when long', () => {
    expect(titleFrom('  Why ATP?  ')).toBe('Why ATP?')
    const long = titleFrom('x'.repeat(80))
    expect(long).toHaveLength(60)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('useConversation', () => {
  const start = () =>
    createConversation({
      workspaceId: DEFAULT_WORKSPACE.id,
      materialIds: ['doc-1'],
      title: 'What makes ATP?',
    })

  it('reports a conversation that is not on this device', async () => {
    const { result } = renderHook(() => useConversation('nope', [document]))

    await waitFor(() => expect(result.current.state.status).toBe('missing'))
  })

  it('restores saved messages with their citations', async () => {
    const conversation = await start()
    await appendMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'Saved question?',
    })

    const { result } = renderHook(() =>
      useConversation(conversation.id, [document]),
    )

    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    const { state } = result.current
    expect(state.status === 'ready' && state.initialMessages).toMatchObject([
      { role: 'user', content: 'Saved question?' },
    ])
  })

  it('saves each answered exchange in order', async () => {
    const conversation = await start()
    const { result } = renderHook(() =>
      useConversation(conversation.id, [document]),
    )
    await waitFor(() => expect(result.current.state.status).toBe('ready'))

    // Real questions are seconds apart; pin the clock so the test is too.
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1000)
    await act(() => result.current.record({ question: 'One?', reply }))
    now.mockReturnValue(2000)
    await act(() => result.current.record({ question: 'Two?', reply }))
    now.mockRestore()

    const messages = await listMessages(conversation.id)
    expect(messages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: 'user', content: 'One?' },
      { role: 'assistant', content: 'They produce ATP.' },
      { role: 'user', content: 'Two?' },
      { role: 'assistant', content: 'They produce ATP.' },
    ])
  })
})
