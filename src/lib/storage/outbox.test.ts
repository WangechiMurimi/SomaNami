import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StorageAdapter } from './adapter.ts'
import {
  appendMessage,
  createConversation,
  createWorkspace,
  deleteConversation,
  deleteDocument,
  deleteWorkspace,
  ensureDefaultWorkspace,
  getConversation,
  getDocument,
  listMessages,
  listOutbox,
  moveDocument,
  renameConversation,
  saveDocument,
  setStorageAdapter,
  subscribeToDocuments,
  updateWorkspace,
} from './index.ts'
import type { OutboxEntry } from './index.ts'
import { changedAt, nextSeq, outboxEntry } from './outbox.ts'
import { DEFAULT_WORKSPACE } from './schema.ts'
import { ADAPTERS } from './test-adapters.ts'
import { newDoc } from './testing/documents.ts'

const material = (id: string, workspaceId?: string) =>
  saveDocument(
    newDoc(id, { name: `${id}.pdf`, kind: 'pdf', pageCount: 1 }),
    workspaceId,
  )

// The outbox as `type:id op` strings, oldest first: what a pusher would send.
const pending = async () =>
  (await listOutbox()).map(
    ({ recordType, recordId, op }) => `${recordType}:${recordId} ${op}`,
  )

const entryFor = async (recordType: string, recordId: string) =>
  (await listOutbox()).find(
    (entry) => entry.recordType === recordType && entry.recordId === recordId,
  )

describe('outbox entries', () => {
  it('are keyed by record, so a record has at most one entry', () => {
    expect(outboxEntry('documents', 'd1', 'upsert', 5)).toMatchObject({
      id: 'documents:d1',
      recordType: 'documents',
      recordId: 'd1',
      op: 'upsert',
      updatedAt: 5,
    })
  })

  it('are ordered by a seq that never repeats, even within one millisecond', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1)
    const seqs = [nextSeq(), nextSeq(), nextSeq()]
    now.mockRestore()

    expect(new Set(seqs).size).toBe(3)
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs)
  })

  it('carry updatedAt, or createdAt for records that are never edited', () => {
    expect(changedAt({ updatedAt: 2, createdAt: 1 })).toBe(2)
    expect(changedAt({ createdAt: 1 })).toBe(1)
  })
})

describe.each(ADAPTERS)('change tracking on the %s adapter', (_name, make) => {
  let adapter: StorageAdapter
  beforeEach(() => {
    adapter = make()
    setStorageAdapter(adapter)
  })
  afterEach(() => {
    setStorageAdapter(null)
    vi.restoreAllMocks()
  })

  it('starts empty', async () => {
    expect(await listOutbox()).toEqual([])
  })

  it('queues an upsert for each workspace written', async () => {
    const workspace = await createWorkspace({ name: 'Biology' })
    await ensureDefaultWorkspace()

    expect(await pending()).toEqual([
      `workspaces:${workspace.id} upsert`,
      'workspaces:default upsert',
    ])
    expect(await entryFor('workspaces', workspace.id)).toMatchObject({
      updatedAt: workspace.updatedAt,
    })
  })

  it('keeps one entry per record, carrying the latest change', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const workspace = await createWorkspace({ name: 'Biology' })
    const first = await entryFor('workspaces', workspace.id)
    now.mockReturnValue(2000)
    await updateWorkspace(workspace.id, { topic: 'Cells' })

    const entries = await listOutbox()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ updatedAt: 2000 })
    expect(entries[0]!.seq).toBeGreaterThan(first!.seq)
  })

  it('stamps a saved document and queues it, keeping createdAt on a resave', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const saved = await material('d1')
    now.mockReturnValue(2000)
    const resaved = await saveDocument(saved)

    expect(saved).toMatchObject({ createdAt: 1000, updatedAt: 1000 })
    expect(resaved).toMatchObject({ createdAt: 1000, updatedAt: 2000 })
    expect(await entryFor('documents', 'd1')).toMatchObject({
      op: 'upsert',
      updatedAt: 2000,
    })
  })

  it('queues a conversation when it is created and renamed', async () => {
    await material('d1')
    const conversation = await createConversation({
      workspaceId: DEFAULT_WORKSPACE.id,
      materialIds: ['d1'],
    })
    const renamed = await renameConversation(conversation.id, 'Cells')

    expect(await entryFor('conversations', conversation.id)).toMatchObject({
      op: 'upsert',
      updatedAt: renamed.updatedAt,
    })
  })

  describe('appendMessage', () => {
    it('queues the message and the touched conversation together', async () => {
      await material('d1')
      const conversation = await createConversation({
        workspaceId: DEFAULT_WORKSPACE.id,
        materialIds: ['d1'],
      })
      const message = await appendMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Why?',
        createdAt: 5000,
      })

      expect(await entryFor('messages', message.id)).toMatchObject({
        op: 'upsert',
        updatedAt: 5000,
      })
      expect(await entryFor('conversations', conversation.id)).toMatchObject({
        updatedAt: 5000,
      })
    })

    it('is one commit: a failed write stores neither half', async () => {
      await material('d1')
      const conversation = await createConversation({
        workspaceId: DEFAULT_WORKSPACE.id,
        materialIds: ['d1'],
      })
      vi.spyOn(adapter, 'commit').mockRejectedValueOnce(new Error('full'))

      await expect(
        appendMessage({ conversationId: conversation.id, role: 'user' }),
      ).rejects.toThrow('full')
      expect(await listMessages(conversation.id)).toEqual([])
      expect(await getConversation(conversation.id)).toEqual(conversation)
    })
  })

  describe('deleteConversation', () => {
    it('leaves a tombstone for the conversation and each of its messages', async () => {
      await material('d1')
      const conversation = await createConversation({
        workspaceId: DEFAULT_WORKSPACE.id,
        materialIds: ['d1'],
      })
      const message = await appendMessage({
        conversationId: conversation.id,
        role: 'user',
      })
      vi.spyOn(Date, 'now').mockReturnValue(9000)
      await deleteConversation(conversation.id)

      expect(await entryFor('messages', message.id)).toMatchObject({
        op: 'delete',
        updatedAt: 9000,
      })
      expect(await entryFor('conversations', conversation.id)).toMatchObject({
        op: 'delete',
        updatedAt: 9000,
      })
    })

    it('is one commit: a failed delete keeps the messages', async () => {
      await material('d1')
      const conversation = await createConversation({
        workspaceId: DEFAULT_WORKSPACE.id,
        materialIds: ['d1'],
      })
      await appendMessage({ conversationId: conversation.id, role: 'user' })
      vi.spyOn(adapter, 'commit').mockRejectedValueOnce(new Error('full'))

      await expect(deleteConversation(conversation.id)).rejects.toThrow('full')
      expect(await listMessages(conversation.id)).toHaveLength(1)
      expect(await getConversation(conversation.id)).toBeDefined()
    })
  })

  describe('deleteDocument', () => {
    it('tombstones the document and every chat it emptied, with their messages', async () => {
      await material('d1')
      const only = await createConversation({
        workspaceId: DEFAULT_WORKSPACE.id,
        materialIds: ['d1'],
      })
      const message = await appendMessage({
        conversationId: only.id,
        role: 'user',
      })
      await deleteDocument('d1')

      expect(await pending()).toEqual(
        expect.arrayContaining([
          'documents:d1 delete',
          `conversations:${only.id} delete`,
          `messages:${message.id} delete`,
        ]),
      )
    })

    it('bumps updatedAt on the chats it edited, so the edit wins a sync', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
      await material('d1')
      await material('d2')
      const shared = await createConversation({
        workspaceId: DEFAULT_WORKSPACE.id,
        materialIds: ['d1', 'd2'],
      })
      now.mockReturnValue(2000)
      await deleteDocument('d1')

      expect(await getConversation(shared.id)).toMatchObject({
        materialIds: ['d2'],
        updatedAt: 2000,
      })
      expect(await entryFor('conversations', shared.id)).toMatchObject({
        op: 'upsert',
        updatedAt: 2000,
      })
    })
  })

  describe('moveDocument', () => {
    it('queues the moved document and the chats that dropped it, with updatedAt bumped', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
      const biology = await createWorkspace({ name: 'Biology' })
      const history = await createWorkspace({ name: 'History' })
      await material('d1', biology.id)
      await material('d2', biology.id)
      const workspaceChat = await createConversation({
        workspaceId: biology.id,
        materialIds: ['d1', 'd2'],
      })
      now.mockReturnValue(2000)
      const moved = await moveDocument('d1', history.id)

      expect(moved).toMatchObject({ workspaceId: history.id, updatedAt: 2000 })
      expect(await getDocument('d1')).toMatchObject({ updatedAt: 2000 })
      expect(await entryFor('documents', 'd1')).toMatchObject({
        op: 'upsert',
        updatedAt: 2000,
      })
      expect(await getConversation(workspaceChat.id)).toMatchObject({
        materialIds: ['d2'],
        updatedAt: 2000,
      })
      expect(await entryFor('conversations', workspaceChat.id)).toMatchObject({
        op: 'upsert',
        updatedAt: 2000,
      })
    })

    it('leaves loose chats, which keep the material, untouched and unqueued', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
      const biology = await createWorkspace({ name: 'Biology' })
      const history = await createWorkspace({ name: 'History' })
      await material('d1', biology.id)
      const looseChat = await createConversation({
        workspaceId: DEFAULT_WORKSPACE.id,
        materialIds: ['d1'],
      })
      const entryBefore = await entryFor('conversations', looseChat.id)
      now.mockReturnValue(2000)
      await moveDocument('d1', history.id)

      expect(await getConversation(looseChat.id)).toEqual(looseChat)
      expect(await entryFor('conversations', looseChat.id)).toEqual(entryBefore)
    })

    it('queues nothing when the material is already in that workspace', async () => {
      const biology = await createWorkspace({ name: 'Biology' })
      await material('d1', biology.id)
      const before = await listOutbox()

      await moveDocument('d1', biology.id)

      expect(await listOutbox()).toEqual(before)
    })
  })

  it('tombstones everything a deleted workspace held', async () => {
    const workspace = await createWorkspace({ name: 'Biology' })
    await material('d1', workspace.id)
    const conversation = await createConversation({
      workspaceId: workspace.id,
      materialIds: ['d1'],
    })
    const message = await appendMessage({
      conversationId: conversation.id,
      role: 'user',
    })
    await deleteWorkspace(workspace.id)

    expect((await pending()).sort()).toEqual(
      [
        `conversations:${conversation.id} delete`,
        'documents:d1 delete',
        `messages:${message.id} delete`,
        `workspaces:${workspace.id} delete`,
      ].sort(),
    )
  })

  it('records nothing when the write fails', async () => {
    vi.spyOn(adapter, 'commit').mockRejectedValueOnce(new Error('full'))

    await expect(createWorkspace({ name: 'Biology' })).rejects.toThrow('full')
    expect(await listOutbox()).toEqual([])
  })

  it('lists entries oldest first', async () => {
    await createWorkspace({ name: 'A' })
    await createWorkspace({ name: 'B' })
    await createWorkspace({ name: 'C' })

    const seqs = (await listOutbox()).map((entry: OutboxEntry) => entry.seq)
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
  })

  describe('subscribeToDocuments', () => {
    it('fires when a document is saved or removed, until unsubscribed', async () => {
      const listener = vi.fn()
      const unsubscribe = subscribeToDocuments(listener)

      await material('d1')
      expect(listener).toHaveBeenCalledTimes(1)
      await deleteDocument('d1')
      expect(listener).toHaveBeenCalledTimes(2)

      unsubscribe()
      await material('d2')
      expect(listener).toHaveBeenCalledTimes(2)
    })

    it('fires when a deleted workspace took documents with it', async () => {
      const workspace = await createWorkspace({ name: 'Biology' })
      await material('d1', workspace.id)
      const listener = vi.fn()
      const unsubscribe = subscribeToDocuments(listener)

      await deleteWorkspace(workspace.id)
      unsubscribe()
      expect(listener).toHaveBeenCalledTimes(1)
    })
  })
})
