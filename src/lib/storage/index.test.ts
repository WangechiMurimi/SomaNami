import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appendMessage,
  createConversation,
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

// Every behaviour runs against real IndexedDB as well as the in-memory double:
// US-07's offline guarantee rests on the IndexedDB path, not the substitute.
describe.each(ADAPTERS)(
  'storage API on the %s adapter',
  (_name, makeAdapter) => {
    beforeEach(() => setStorageAdapter(makeAdapter()))
    afterEach(() => setStorageAdapter(null))

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
        const conversation = await createConversation({
          documentId: 'doc-1',
          title: 'Chapter 1',
        })
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
        const conversation = await createConversation({ documentId: 'doc-1' })
        await appendMessage({
          conversationId: conversation.id,
          role: 'user',
          content: 'Why ATP?',
        })
        // Simulates the batch failing (quota, tab closed mid-write): nothing
        // may be removed one-by-one before it.
        vi.spyOn(adapter, 'removeMany').mockRejectedValueOnce(
          new Error('write failed'),
        )

        await expect(deleteDocument('doc-1')).rejects.toThrow('write failed')

        expect(await getDocument('doc-1')).toBeDefined()
        expect(await listConversations('doc-1')).toHaveLength(1)
        expect(await listMessages(conversation.id)).toHaveLength(1)
      })

      it('leaves another document’s conversations alone when one is deleted', async () => {
        await saveDocument(makeDocument())
        await saveDocument(makeDocument({ id: 'doc-2', name: 'Other.pdf' }))
        const kept = await createConversation({
          documentId: 'doc-2',
          title: 'Keep me',
        })

        await deleteDocument('doc-1')

        expect(await listConversations('doc-2')).toEqual([kept])
      })
    })

    describe('conversations', () => {
      it('creates a conversation with timestamps and a generated id', async () => {
        const conversation = await createConversation({
          documentId: 'doc-1',
          title: 'Chapter 1',
        })

        expect(conversation).toMatchObject({
          documentId: 'doc-1',
          title: 'Chapter 1',
        })
        expect(conversation.id).toEqual(expect.any(String))
        expect(conversation.updatedAt).toBe(conversation.createdAt)
        expect(await getConversation(conversation.id)).toEqual(conversation)
      })

      it('defaults the title when none is given', async () => {
        const conversation = await createConversation({ documentId: 'doc-1' })
        expect(conversation.title).toBe('Untitled conversation')
      })

      it('requires a documentId', async () => {
        await expect(createConversation({})).rejects.toThrow(TypeError)
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
        const older = await createConversation({
          documentId: 'doc-1',
          title: 'Older',
        })
        now.mockReturnValue(2000)
        const newer = await createConversation({
          documentId: 'doc-1',
          title: 'Newer',
        })
        await createConversation({ documentId: 'doc-2', title: 'Elsewhere' })
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
        await createConversation({ documentId: 'doc-1', title: 'First' })
        now.mockReturnValue(2000)
        await createConversation({ documentId: 'doc-2', title: 'Second' })
        now.mockReturnValue(3000)
        await createConversation({ documentId: 'doc-1', title: 'Third' })
        now.mockRestore()

        const titles = async (limit?: number) =>
          (await listRecentConversations(limit)).map(({ title }) => title)
        expect(await titles()).toEqual(['Third', 'Second', 'First'])
        expect(await titles(2)).toEqual(['Third', 'Second'])
      })

      it('tells subscribers when conversations change, until they unsubscribe', async () => {
        const listener = vi.fn()
        const unsubscribe = subscribeToConversations(listener)

        const conversation = await createConversation({ documentId: 'doc-1' })
        await appendMessage({
          conversationId: conversation.id,
          role: 'user',
          content: 'Why?',
        })
        await renameConversation(conversation.id, 'Renamed')
        await deleteConversation(conversation.id)
        expect(listener).toHaveBeenCalledTimes(4)

        unsubscribe()
        await createConversation({ documentId: 'doc-1' })
        expect(listener).toHaveBeenCalledTimes(4)
      })

      it('rejects renaming a conversation that does not exist', async () => {
        await expect(renameConversation('nope', 'x')).rejects.toThrow(
          /No conversation/,
        )
      })

      it('deletes a conversation and its messages but keeps its siblings', async () => {
        const doomed = await createConversation({
          documentId: 'doc-1',
          title: 'Doomed',
        })
        const kept = await createConversation({
          documentId: 'doc-1',
          title: 'Kept',
        })
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
      it('stores assistant grounding fields and keeps them off user messages', async () => {
        const conversation = await createConversation({ documentId: 'doc-1' })

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
        const conversation = await createConversation({ documentId: 'doc-1' })
        const answer = await appendMessage({
          conversationId: conversation.id,
          role: 'assistant',
          content: 'The document does not say.',
        })

        expect(answer).toMatchObject({ answerable: false, citations: [] })
      })

      it('replays messages in the order they were written', async () => {
        const conversation = await createConversation({ documentId: 'doc-1' })
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
        const conversation = await createConversation({ documentId: 'doc-1' })
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
        const conversation = await createConversation({ documentId: 'doc-1' })

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
