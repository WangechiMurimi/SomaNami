import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { createIndexedDbAdapter } from './indexeddb-adapter.js'
import {
  CONVERSATIONS,
  DB_NAME,
  DB_VERSION,
  DOCUMENTS,
  MESSAGES,
  STORES,
} from './schema.js'

/** Opens the database directly, to inspect what the upgrade actually created. */
const openRaw = (factory) =>
  new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

describe('createIndexedDbAdapter', () => {
  let factory

  beforeEach(() => {
    // A fresh factory per test, so `indexedDB` stays untouched for the rest of
    // the suite and no database leaks between cases.
    factory = new IDBFactory()
  })

  it('fails loudly where IndexedDB is unavailable instead of losing writes', () => {
    expect(() => createIndexedDbAdapter(undefined)).toThrow(/not available/)
  })

  describe('upgrade path', () => {
    beforeEach(async () => {
      // Any read forces the first open, which is what runs `onupgradeneeded`.
      await createIndexedDbAdapter(factory).getAll(DOCUMENTS)
    })

    it('creates every store in the schema at the schema version', async () => {
      const db = await openRaw(factory)

      expect(db.version).toBe(DB_VERSION)
      expect([...db.objectStoreNames].sort()).toEqual(
        STORES.map((store) => store.name).sort(),
      )
      db.close()
    })

    it('keys every store on the keyPath the schema declares', async () => {
      const db = await openRaw(factory)
      const transaction = db.transaction([...db.objectStoreNames], 'readonly')

      for (const { name, keyPath } of STORES) {
        expect(transaction.objectStore(name).keyPath).toBe(keyPath)
      }
      db.close()
    })

    it('creates the documentId and conversationId indexes', async () => {
      const db = await openRaw(factory)
      const transaction = db.transaction([CONVERSATIONS, MESSAGES], 'readonly')

      const conversations = transaction.objectStore(CONVERSATIONS)
      expect([...conversations.indexNames]).toEqual(['documentId'])
      expect(conversations.index('documentId').keyPath).toBe('documentId')

      const messages = transaction.objectStore(MESSAGES)
      expect([...messages.indexNames]).toEqual(['conversationId'])
      expect(messages.index('conversationId').keyPath).toBe('conversationId')

      db.close()
    })

    it('leaves documents without indexes, as the schema declares', async () => {
      const db = await openRaw(factory)
      const documents = db
        .transaction(DOCUMENTS, 'readonly')
        .objectStore(DOCUMENTS)

      expect([...documents.indexNames]).toEqual([])
      db.close()
    })

    it('runs the upgrade only once, so a second adapter reuses the database', async () => {
      await createIndexedDbAdapter(factory).put(DOCUMENTS, {
        id: 'd1',
        name: 'kept',
      })

      const reopened = createIndexedDbAdapter(factory)
      expect(await reopened.get(DOCUMENTS, 'd1')).toEqual({
        id: 'd1',
        name: 'kept',
      })
    })
  })

  it('survives a close and reopen, which is what offline reading depends on', async () => {
    const first = createIndexedDbAdapter(factory)
    await first.put(DOCUMENTS, {
      id: 'doc-1',
      chunks: [{ id: 0, text: 'ATP', source: { type: 'page', page: 1 } }],
    })
    await first.close()

    const second = createIndexedDbAdapter(factory)
    expect(await second.get(DOCUMENTS, 'doc-1')).toEqual({
      id: 'doc-1',
      chunks: [{ id: 0, text: 'ATP', source: { type: 'page', page: 1 } }],
    })
  })

  it('commits a write before resolving, so a reopen cannot miss it', async () => {
    const adapter = createIndexedDbAdapter(factory)
    await adapter.put(DOCUMENTS, { id: 'doc-1' })
    await adapter.close()

    const db = await openRaw(factory)
    const store = db.transaction(DOCUMENTS, 'readonly').objectStore(DOCUMENTS)
    const count = await new Promise((resolve) => {
      const request = store.count()
      request.onsuccess = () => resolve(request.result)
    })

    expect(count).toBe(1)
    db.close()
  })
})
