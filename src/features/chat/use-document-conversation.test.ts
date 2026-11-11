import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  appendMessage,
  createConversation,
  createMemoryAdapter,
  listConversations,
  listMessages,
  setStorageAdapter,
} from '../../lib/storage/index.ts'
import type { StoredDocument } from '../../types/contracts.ts'
import {
  toChatTurns,
  toPassages,
  useDocumentConversation,
} from './use-document-conversation.ts'

const document: StoredDocument = {
  id: 'doc-1',
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

beforeEach(() => setStorageAdapter(createMemoryAdapter()))

describe('toPassages', () => {
  it('turns every chunk into a citable passage', () => {
    expect(toPassages(document)).toEqual([
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
  it('resolves stored citations against the document', () => {
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
      document,
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

describe('useDocumentConversation', () => {
  it('starts empty for a document with no conversation, without creating one', async () => {
    const { result } = renderHook(() => useDocumentConversation(document))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.initialMessages).toEqual([])
    expect(await listConversations('doc-1')).toEqual([])
  })

  it('creates the conversation on the first answered question, titled by it', async () => {
    const { result } = renderHook(() => useDocumentConversation(document))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(() =>
      result.current.record({ question: 'What makes ATP?', reply }),
    )

    const [conversation] = await listConversations('doc-1')
    expect(conversation?.title).toBe('What makes ATP?')
    const messages = await listMessages(conversation!.id)
    expect(messages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: 'user', content: 'What makes ATP?' },
      { role: 'assistant', content: 'They produce ATP.' },
    ])
  })

  it('appends later exchanges to the same conversation', async () => {
    const { result } = renderHook(() => useDocumentConversation(document))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(() => result.current.record({ question: 'One?', reply }))
    await act(() => result.current.record({ question: 'Two?', reply }))

    const conversations = await listConversations('doc-1')
    expect(conversations).toHaveLength(1)
    expect(await listMessages(conversations[0]!.id)).toHaveLength(4)
  })

  it('restores the most recent conversation', async () => {
    const conversation = await createConversation({ documentId: 'doc-1' })
    await appendMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'Saved question?',
    })

    const { result } = renderHook(() => useDocumentConversation(document))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.initialMessages).toMatchObject([
      { role: 'user', content: 'Saved question?' },
    ])
  })
})
