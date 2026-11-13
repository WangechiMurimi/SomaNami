import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appendMessage,
  createConversation,
  createWorkspace,
  deleteWorkspace,
  ensureDefaultWorkspace,
  getWorkspace,
  listWorkspaceConversations,
  listWorkspaceDocuments,
  listWorkspaces,
  updateWorkspace,
  deleteConversation,
  deleteDocument,
  getConversation,
  getDocument,
  listConversations,
  listDocuments,
  listMessages,
  listRecentConversations,
  renameConversation,
  saveDocument,
  setStorageAdapter,
  subscribeToConversations,
  DEFAULT_WORKSPACE,
} from './index.ts'
import { ADAPTERS } from './test-adapters.ts'
import type {
  AssistantMessage,
  Role,
  StoredDocument,
} from '../../types/contracts.ts'

const makeDocument = (
  overrides: Partial<StoredDocument> = {},
): StoredDocument => ({
  id: 'doc-1',
  workspaceId: DEFAULT_WORKSPACE.id,
  name: 'Cell Biology.pdf',
  size: 2048,
  kind: 'pdf',
  pageCount: 3,
  chunks: [
    {
      id: `doc-1:0`,
      text: 'Mitochondria produce ATP.',
      source: { type: 'page', page: 1 },
    },
    {
      id: `doc-1:1`,
      text: 'Ribosomes assemble proteins.',
      source: { type: 'paragraph', paragraph: 4 },
    },
    {
      id: `doc-1:2`,
      text: 'The nucleus holds DNA.',
      source: { type: 'line', startLine: 9, endLine: 12 },
    },
  ],
  ...overrides,
})

// A conversation over one material in the default workspace, the way the app
// creates one today.
const chat = (materialId: string, title?: string) =>
  createConversation({
    workspaceId: DEFAULT_WORKSPACE.id,
    materialIds: [materialId],
    title,
  })

// Every behaviour runs against real IndexedDB as well as the in-memory double:
// US-07's offline guarantee rests on the IndexedDB path, not the substitute.
describe.each(ADAPTERS)(
  'storage API on the %s adapter',
  (_name, makeAdapter) => {
    beforeEach(() => setStorageAdapter(makeAdapter()))
    afterEach(() => setStorageAdapter(null))

    describe('workspaces', () => {
      it('creates a workspace with a trimmed name, topic and description', async () => {
        const workspace = await createWorkspace({
          name: '  Memory & learning ',
          topic: 'Psychology',
          description: 'Week 3 readings',
        })

        expect(workspace).toMatchObject({
          name: 'Memory & learning',
          topic: 'Psychology',
          description: 'Week 3 readings',
        })
        expect(await getWorkspace(workspace.id)).toEqual(workspace)
      })

      it('requires a name', async () => {
        await expect(createWorkspace({ name: '   ' })).rejects.toThrow(
          TypeError,
        )
      })

      it('lists workspaces, most recently updated first', async () => {
        const now = vi.spyOn(Date, 'now')
        now.mockReturnValue(1000)
        const older = await createWorkspace({ name: 'Older' })
        now.mockReturnValue(2000)
        await createWorkspace({ name: 'Newer' })
        now.mockReturnValue(3000)
        await updateWorkspace(older.id, { topic: 'Touched' })
        now.mockRestore()

        expect((await listWorkspaces()).map(({ name }) => name)).toEqual([
          'Older',
          'Newer',
        ])
      })

      it('updates only the fields given, and keeps a name', async () => {
        const workspace = await createWorkspace({ name: 'A', topic: 'T' })

        const updated = await updateWorkspace(workspace.id, { name: 'B' })
        expect(updated).toMatchObject({ name: 'B', topic: 'T' })
        await expect(
          updateWorkspace(workspace.id, { name: ' ' }),
        ).rejects.toThrow(TypeError)
        await expect(updateWorkspace('nope', {})).rejects.toThrow(
          /No workspace/,
        )
      })

      it('creates the default workspace once, on first use', async () => {
        const first = await ensureDefaultWorkspace()
        const second = await ensureDefaultWorkspace()

        expect(first).toEqual(second)
        expect(first).toMatchObject({ id: DEFAULT_WORKSPACE.id })
        expect(await listWorkspaces()).toHaveLength(1)
      })

      it('files a material without a workspace under the default one', async () => {
        const { workspaceId, ...unfiled } = makeDocument()
        const stored = await saveDocument(unfiled)

        expect(workspaceId).toBe(DEFAULT_WORKSPACE.id)
        expect(stored.workspaceId).toBe(DEFAULT_WORKSPACE.id)
        expect(await getWorkspace(DEFAULT_WORKSPACE.id)).toBeDefined()
      })

      it('refuses a material for a workspace that does not exist', async () => {
        await expect(
          saveDocument(makeDocument({ workspaceId: 'nope' })),
        ).rejects.toThrow(/No workspace/)
      })

      it('lists only a workspace’s own materials and conversations', async () => {
        const biology = await createWorkspace({ name: 'Biology' })
        const history = await createWorkspace({ name: 'History' })
        await saveDocument(makeDocument({ id: 'cell' }), biology.id)
        await saveDocument(makeDocument({ id: 'rome' }), history.id)
        const chat = await createConversation({
          workspaceId: biology.id,
          materialIds: ['cell'],
        })

        expect(
          (await listWorkspaceDocuments(biology.id)).map(({ id }) => id),
        ).toEqual(['cell'])
        expect(await listWorkspaceConversations(biology.id)).toEqual([chat])
        expect(await listWorkspaceConversations(history.id)).toEqual([])
      })

      it('never lets a conversation use another workspace’s material (US-08 AC3)', async () => {
        const biology = await createWorkspace({ name: 'Biology' })
        const history = await createWorkspace({ name: 'History' })
        await saveDocument(makeDocument({ id: 'cell' }), biology.id)
        await saveDocument(makeDocument({ id: 'rome' }), history.id)

        await expect(
          createConversation({
            workspaceId: biology.id,
            materialIds: ['cell', 'rome'],
          }),
        ).rejects.toThrow(/not in workspace/)
        await expect(
          createConversation({
            workspaceId: biology.id,
            materialIds: ['missing'],
          }),
        ).rejects.toThrow(/not in workspace/)
        expect(await listWorkspaceConversations(biology.id)).toEqual([])
      })

      it('deletes a workspace with its materials, conversations and messages', async () => {
        const biology = await createWorkspace({ name: 'Biology' })
        const kept = await createWorkspace({ name: 'Kept' })
        await saveDocument(makeDocument({ id: 'cell' }), biology.id)
        await saveDocument(makeDocument({ id: 'other' }), kept.id)
        const conversation = await createConversation({
          workspaceId: biology.id,
          materialIds: ['cell'],
        })
        await appendMessage({
          conversationId: conversation.id,
          role: 'user',
          content: 'Why?',
        })

        await deleteWorkspace(biology.id)

        expect(await getWorkspace(biology.id)).toBeUndefined()
        expect(await getDocument('cell')).toBeUndefined()
        expect(await getConversation(conversation.id)).toBeUndefined()
        expect(await listMessages(conversation.id)).toEqual([])
        expect(await getDocument('other')).toBeDefined()
      })

      it('keeps the whole workspace when its delete fails part-way', async () => {
        const adapter = makeAdapter()
        setStorageAdapter(adapter)
        const biology = await createWorkspace({ name: 'Biology' })
        await saveDocument(makeDocument({ id: 'cell' }), biology.id)
        vi.spyOn(adapter, 'commit').mockRejectedValueOnce(
          new Error('write failed'),
        )

        await expect(deleteWorkspace(biology.id)).rejects.toThrow(
          'write failed',
        )
        expect(await getWorkspace(biology.id)).toBeDefined()
        expect(await getDocument('cell')).toBeDefined()
      })
    })

    describe('documents', () => {
      it('round-trips a document with every source reference intact (US-07)', async () => {
        const document = makeDocument()
        await saveDocument(document)

        expect(await getDocument('doc-1')).toEqual(document)
      })

      it('does not alias the caller’s object', async () => {
        const document = makeDocument()
        await saveDocument(document)
        const source = document.chunks[0]!.source
        if (source.type === 'page') source.page = 99

        const stored = await getDocument('doc-1')
        expect(stored?.chunks[0]?.source).toEqual({ type: 'page', page: 1 })
      })

      it('returns undefined for a document that was never saved', async () => {
        expect(await getDocument('missing')).toBeUndefined()
      })

      it('lists documents by name', async () => {
        await saveDocument(makeDocument({ id: 'b', name: 'Zoology.pdf' }))
        await saveDocument(makeDocument({ id: 'a', name: 'Anatomy.pdf' }))

        expect((await listDocuments()).map((doc) => doc.name)).toEqual([
          'Anatomy.pdf',
          'Zoology.pdf',
        ])
      })

      it('overwrites a document saved twice under the same id', async () => {
        await saveDocument(makeDocument())
        await saveDocument(makeDocument({ name: 'Renamed.pdf' }))

        expect(await listDocuments()).toHaveLength(1)
        expect((await getDocument('doc-1'))?.name).toBe('Renamed.pdf')
      })

      it('rejects a document without an id', async () => {
        // Deliberately malformed: the runtime guard is what is under test.
        await expect(
          saveDocument({ name: 'nameless' } as StoredDocument),
        ).rejects.toThrow(TypeError)
      })

      it('deletes a document together with its conversations and messages', async () => {
        await saveDocument(makeDocument())
        const conversation = await chat('doc-1', 'Chapter 1')
        await appendMessage({
          conversationId: conversation.id,
          role: 'user',
          content: 'Why ATP?',
        })

        await deleteDocument('doc-1')

        expect(await getDocument('doc-1')).toBeUndefined()
        expect(await listConversations('doc-1')).toEqual([])
        expect(await listMessages(conversation.id)).toEqual([])
      })

      it('keeps the document and its conversations when the delete fails part-way', async () => {
        const adapter = makeAdapter()
        setStorageAdapter(adapter)
        await saveDocument(makeDocument())
        const conversation = await chat('doc-1')
        await appendMessage({
          conversationId: conversation.id,
          role: 'user',
          content: 'Why ATP?',
        })
        // Simulates the batch failing (quota, tab closed mid-write): nothing
        // may be removed one-by-one before it.
        vi.spyOn(adapter, 'commit').mockRejectedValueOnce(
          new Error('write failed'),
        )

        await expect(deleteDocument('doc-1')).rejects.toThrow('write failed')

        expect(await getDocument('doc-1')).toBeDefined()
        expect(await listConversations('doc-1')).toHaveLength(1)
        expect(await listMessages(conversation.id)).toHaveLength(1)
      })

      it('keeps a chat that still has other materials, minus the deleted one', async () => {
        await saveDocument(makeDocument())
        await saveDocument(makeDocument({ id: 'doc-2', name: 'Other.pdf' }))
        const both = await createConversation({
          workspaceId: DEFAULT_WORKSPACE.id,
          materialIds: ['doc-1', 'doc-2'],
        })
        await appendMessage({
          conversationId: both.id,
          role: 'user',
          content: 'Compare them',
        })

        await deleteDocument('doc-1')

        expect((await getConversation(both.id))?.materialIds).toEqual(['doc-2'])
        expect(await listMessages(both.id)).toHaveLength(1)
      })

      it('leaves another document’s conversations alone when one is deleted', async () => {
        await saveDocument(makeDocument())
        await saveDocument(makeDocument({ id: 'doc-2', name: 'Other.pdf' }))
        const kept = await chat('doc-2', 'Keep me')

        await deleteDocument('doc-1')

        expect(await listConversations('doc-2')).toEqual([kept])
      })
    })

    describe('conversations', () => {
      // Conversations may only use materials stored in their workspace.
      beforeEach(async () => {
        await saveDocument(makeDocument())
        await saveDocument(makeDocument({ id: 'doc-2', name: 'Other.pdf' }))
      })

      it('creates a conversation with timestamps and a generated id', async () => {
        const conversation = await chat('doc-1', 'Chapter 1')

        expect(conversation).toMatchObject({
          workspaceId: DEFAULT_WORKSPACE.id,
          materialIds: ['doc-1'],
          title: 'Chapter 1',
        })
        expect(conversation.id).toEqual(expect.any(String))
        expect(conversation.updatedAt).toBe(conversation.createdAt)
        expect(await getConversation(conversation.id)).toEqual(conversation)
      })

      it('defaults the title when none is given', async () => {
        const conversation = await chat('doc-1')
        expect(conversation.title).toBe('Untitled conversation')
      })

      it('requires a workspace and at least one material', async () => {
        await expect(createConversation({})).rejects.toThrow(TypeError)
        await expect(
          createConversation({ workspaceId: DEFAULT_WORKSPACE.id }),
        ).rejects.toThrow(TypeError)
        // Deliberately missing: the runtime guard is what is under test.
        await expect(
          listConversations(undefined as unknown as string),
        ).rejects.toThrow(TypeError)
      })

      it('lists only the given document’s conversations, most recent first', async () => {
        // Control the clock so the ordering under test is the timestamps, not
        // how fast the machine runs three creates. `Date.now` is stubbed rather
        // than the timers: fake timers stall IndexedDB's event-driven requests.
        const now = vi.spyOn(Date, 'now')

        now.mockReturnValue(1000)
        const older = await chat('doc-1', 'Older')
        now.mockReturnValue(2000)
        const newer = await chat('doc-1', 'Newer')
        await chat('doc-2', 'Elsewhere')
        now.mockReturnValue(3000)
        await renameConversation(newer.id, 'Newer still')
        now.mockRestore()

        const titles = (await listConversations('doc-1')).map(
          (conversation) => conversation.title,
        )
        expect(titles).toEqual(['Newer still', 'Older'])
        expect(await getConversation(older.id)).toEqual(older)
      })

      it('lists recent conversations across documents, newest first', async () => {
        const now = vi.spyOn(Date, 'now')
        now.mockReturnValue(1000)
        await chat('doc-1', 'First')
        now.mockReturnValue(2000)
        await chat('doc-2', 'Second')
        now.mockReturnValue(3000)
        await chat('doc-1', 'Third')
        now.mockRestore()

        const titles = async (limit?: number) =>
          (await listRecentConversations(limit)).map(({ title }) => title)
        expect(await titles()).toEqual(['Third', 'Second', 'First'])
        expect(await titles(2)).toEqual(['Third', 'Second'])
      })

      it('tells subscribers when conversations change, until they unsubscribe', async () => {
        const listener = vi.fn()
        const unsubscribe = subscribeToConversations(listener)

        const conversation = await chat('doc-1')
        await appendMessage({
          conversationId: conversation.id,
          role: 'user',
          content: 'Why?',
        })
        await renameConversation(conversation.id, 'Renamed')
        await deleteConversation(conversation.id)
        expect(listener).toHaveBeenCalledTimes(4)

        unsubscribe()
        await chat('doc-1')
        expect(listener).toHaveBeenCalledTimes(4)
      })

      it('rejects renaming a conversation that does not exist', async () => {
        await expect(renameConversation('nope', 'x')).rejects.toThrow(
          /No conversation/,
        )
      })

      it('deletes a conversation and its messages but keeps its siblings', async () => {
        const doomed = await chat('doc-1', 'Doomed')
        const kept = await chat('doc-1', 'Kept')
        await appendMessage({
          conversationId: doomed.id,
          role: 'user',
          content: 'gone',
        })
        await appendMessage({
          conversationId: kept.id,
          role: 'user',
          content: 'still here',
        })

        await deleteConversation(doomed.id)

        expect(await getConversation(doomed.id)).toBeUndefined()
        expect(await listMessages(doomed.id)).toEqual([])
        expect(await listMessages(kept.id)).toHaveLength(1)
      })
    })

    describe('messages', () => {
      beforeEach(() => saveDocument(makeDocument()))

      it('stores assistant grounding fields and keeps them off user messages', async () => {
        const conversation = await chat('doc-1')

        const question = await appendMessage({
          conversationId: conversation.id,
          role: 'user',
          content: 'What makes ATP?',
          createdAt: 1,
        })
        const answer = await appendMessage({
          conversationId: conversation.id,
          role: 'assistant',
          content: 'Mitochondria do.',
          citations: [{ documentId: 'doc-1', chunkId: 'doc-1:0' }],
          answerable: true,
          createdAt: 2,
        })

        expect(question).not.toHaveProperty('citations')
        expect(question).not.toHaveProperty('answerable')
        expect(answer.role).toBe('assistant')
        const assistant = answer as AssistantMessage
        expect(assistant.citations).toEqual([
          { documentId: 'doc-1', chunkId: 'doc-1:0' },
        ])
        expect(assistant.answerable).toBe(true)
      })

      it('defaults an assistant message to unanswerable with no citations', async () => {
        const conversation = await chat('doc-1')
        const answer = await appendMessage({
          conversationId: conversation.id,
          role: 'assistant',
          content: 'The document does not say.',
        })

        expect(answer).toMatchObject({ answerable: false, citations: [] })
      })

      it('replays messages in the order they were written', async () => {
        const conversation = await chat('doc-1')
        for (const [index, content] of ['first', 'second', 'third'].entries()) {
          await appendMessage({
            conversationId: conversation.id,
            role: index % 2 === 0 ? 'user' : 'assistant',
            content,
            createdAt: index + 1,
          })
        }

        expect(
          (await listMessages(conversation.id)).map(
            (message) => message.content,
          ),
        ).toEqual(['first', 'second', 'third'])
      })

      it('touches the conversation so recent activity sorts first', async () => {
        const conversation = await chat('doc-1')
        await appendMessage({
          conversationId: conversation.id,
          role: 'user',
          content: 'hello',
          createdAt: conversation.createdAt + 5000,
        })

        expect((await getConversation(conversation.id))?.updatedAt).toBe(
          conversation.createdAt + 5000,
        )
      })

      it('rejects an unknown conversation, a missing id, or a bad role', async () => {
        const conversation = await chat('doc-1')

        await expect(
          appendMessage({ conversationId: 'nope', role: 'user', content: 'x' }),
        ).rejects.toThrow(/No conversation/)
        await expect(
          appendMessage({ role: 'user', content: 'x' }),
        ).rejects.toThrow(TypeError)
        await expect(
          appendMessage({
            conversationId: conversation.id,
            // Deliberately invalid: the runtime role check is under test.
            role: 'system' as Role,
            content: 'x',
          }),
        ).rejects.toThrow(TypeError)
        await expect(
          listMessages(undefined as unknown as string),
        ).rejects.toThrow(TypeError)
      })
    })
  },
)
