import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMemoryAdapter,
  DEFAULT_WORKSPACE,
  listConversations,
  saveDocument,
  setStorageAdapter,
} from '../../lib/storage/index.ts'
import type { StoredDocument } from '../../types/contracts.ts'
import { useStartChat } from './use-start-chat.ts'

const document: StoredDocument = {
  id: 'doc-1',
  workspaceId: DEFAULT_WORKSPACE.id,
  createdAt: 1,
  updatedAt: 1,
  name: 'biology.pdf',
  size: 10,
  kind: 'pdf',
  pageCount: 1,
  chunks: [],
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
)

function renderStartChat() {
  return renderHook(() => ({ chat: useStartChat(), location: useLocation() }), {
    wrapper,
  })
}

beforeEach(async () => {
  setStorageAdapter(createMemoryAdapter())
  await saveDocument(document)
})

describe('useStartChat', () => {
  it('creates the chat and opens it with the question to ask', async () => {
    const { result } = renderStartChat()

    await act(() =>
      result.current.chat.start({
        workspaceId: DEFAULT_WORKSPACE.id,
        materialIds: ['doc-1'],
        question: '  What do mitochondria do?  ',
      }),
    )

    const [conversation] = await listConversations('doc-1')
    if (!conversation) throw new Error('No chat was created')
    expect(conversation.title).toBe('What do mitochondria do?')
    expect(result.current.location.pathname).toContain(conversation.id)
    expect(result.current.location.state).toEqual({
      question: 'What do mitochondria do?',
    })
    // Still starting, so a second send can't start a second chat.
    expect(result.current.chat.starting).toBe(true)
    expect(result.current.chat.error).toBeNull()
  })

  it('reports a failure and lets the learner try again', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderStartChat()

    await act(() =>
      result.current.chat.start({
        workspaceId: DEFAULT_WORKSPACE.id,
        materialIds: ['not-stored'],
        question: 'Why?',
      }),
    )

    expect(result.current.chat.error).toBe(
      'We couldn’t start this chat. Try again.',
    )
    expect(result.current.chat.starting).toBe(false)
    expect(result.current.location.pathname).toBe('/')
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })
})
