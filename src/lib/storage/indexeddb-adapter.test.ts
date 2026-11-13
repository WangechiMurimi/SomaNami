import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { createIndexedDbAdapter, deleteDatabase } from './indexeddb-adapter.ts'
import {
  CONVERSATIONS,
  DB_NAME,
  DB_VERSION,
  DEFAULT_WORKSPACE,
  DOCUMENTS,
  MESSAGES,
  STORES,
  WORKSPACES,
} from './schema.ts'

/** Opens the database directly, to inspect what the upgrade actually created. */
const openRaw = (factory: IDBFactory) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

describe('createIndexedDbAdapter', () => {
  let factory: IDBFactory

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

    it('creates the workspace, material and conversation indexes', async () => {
      const db = await openRaw(factory)
      const transaction = db.transaction(
        [DOCUMENTS, CONVERSATIONS, MESSAGES],
        'readonly',
      )

      const documents = transaction.objectStore(DOCUMENTS)
      expect([...documents.indexNames]).toEqual(['workspaceId'])

      const conversations = transaction.objectStore(CONVERSATIONS)
      expect([...conversations.indexNames]).toEqual([
        'materialIds',
        'workspaceId',
      ])
      expect(conversations.index('materialIds').multiEntry).toBe(true)

      const messages = transaction.objectStore(MESSAGES)
      expect([...messages.indexNames]).toEqual(['conversationId'])
      expect(messages.index('conversationId').keyPath).toBe('conversationId')

      db.close()
    })

    it('leaves workspaces without indexes, as the schema declares', async () => {
      const db = await openRaw(factory)
      const workspaces = db
        .transaction(WORKSPACES, 'readonly')
        .objectStore(WORKSPACES)

      expect([...workspaces.indexNames]).toEqual([])
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

  describe('upgrading a v1 database (US-08)', () => {
    // Builds the database exactly as v1 shipped it, with one material and one
    // conversation, so the upgrade runs against real saved data.
    const seedVersionOne = (v1: IDBFactory) =>
      new Promise<void>((resolve, reject) => {
        const request = v1.open(DB_NAME, 1)
        request.onupgradeneeded = () => {
          const db = request.result
          db.createObjectStore(DOCUMENTS, { keyPath: 'id' }).put({
            id: 'd1',
            name: 'Cells.pdf',
          })
          const conversations = db.createObjectStore(CONVERSATIONS, {
            keyPath: 'id',
          })
          conversations.createIndex('documentId', 'documentId')
          conversations.put({ id: 'c1', documentId: 'd1', title: 'Why?' })
          db.createObjectStore(MESSAGES, { keyPath: 'id' }).createIndex(
            'conversationId',
            'conversationId',
          )
        }
        request.onsuccess = () => {
          request.result.close()
          resolve()
        }
        request.onerror = () => reject(request.error)
      })

    it('moves existing materials and chats into the default workspace', async () => {
      await seedVersionOne(factory)
      const adapter = createIndexedDbAdapter(factory)

      expect(await adapter.get(WORKSPACES, DEFAULT_WORKSPACE.id)).toMatchObject(
        { name: DEFAULT_WORKSPACE.name },
      )
      expect(await adapter.get(DOCUMENTS, 'd1')).toEqual({
        id: 'd1',
        name: 'Cells.pdf',
        workspaceId: DEFAULT_WORKSPACE.id,
      })
      expect(await adapter.get(CONVERSATIONS, 'c1')).toEqual({
        id: 'c1',
        title: 'Why?',
        workspaceId: DEFAULT_WORKSPACE.id,
        materialIds: ['d1'],
      })
      expect(
        await adapter.getAllByIndex(CONVERSATIONS, 'materialIds', 'd1'),
      ).toHaveLength(1)
    })

    it('drops the v1 documentId index', async () => {
      await seedVersionOne(factory)
      await createIndexedDbAdapter(factory).getAll(DOCUMENTS)

      const db = await openRaw(factory)
      const conversations = db
        .transaction(CONVERSATIONS, 'readonly')
        .objectStore(CONVERSATIONS)
      expect([...conversations.indexNames]).not.toContain('documentId')
      db.close()
    })

    it('creates no workspace in a brand-new database', async () => {
      const adapter = createIndexedDbAdapter(factory)
      expect(await adapter.getAll(WORKSPACES)).toEqual([])
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
    const count = await new Promise<number>((resolve) => {
      const request = store.count()
      request.onsuccess = () => resolve(request.result)
    })

    expect(count).toBe(1)
    db.close()
  })

  describe('after close (#124)', () => {
    it('stays closed rather than recreating a removed database', async () => {
      const adapter = createIndexedDbAdapter(factory)
      await adapter.put(DOCUMENTS, { id: 'doc-1' })
      await adapter.close()
      await deleteDatabase(factory, DB_NAME)

      // A call still holding this adapter, say one that started before the
      // owner removed their materials, must not bring the database back.
      await expect(adapter.put(DOCUMENTS, { id: 'doc-2' })).rejects.toThrow(
        /closed/,
      )
      await expect(adapter.get(DOCUMENTS, 'doc-1')).rejects.toThrow(/closed/)
      expect(await factory.databases()).toEqual([])
    })
  })
})

describe('deleteDatabase (#124)', () => {
  let factory: IDBFactory

  beforeEach(() => {
    factory = new IDBFactory()
  })

  const pending = Symbol('pending')
  // Whether the promise has settled yet, without waiting for it to.
  const settledYet = (promise: Promise<unknown>) =>
    Promise.race([
      promise.then(() => 'resolved'),
      new Promise((resolve) => setTimeout(() => resolve(pending), 50)),
    ])

  it('waits while another tab holds the database, until it lets go', async () => {
    const other = await openRaw(factory)
    // Unlike our adapter, this connection doesn't step aside by itself.
    let release = () => {}
    const released = new Promise<void>((resolve) => {
      release = () => {
        other.close()
        resolve()
      }
    })

    const deleting = deleteDatabase(factory, DB_NAME)
    expect(await settledYet(deleting)).toBe(pending)

    release()
    await released
    await expect(deleting).resolves.toBeUndefined()
    expect(await factory.databases()).toEqual([])
  })

  it('finishes at once when our own adapter is the other connection', async () => {
    const adapter = createIndexedDbAdapter(factory)
    await adapter.put(DOCUMENTS, { id: 'doc-1' })

    // The adapter closes itself on `versionchange`, so nothing blocks.
    await deleteDatabase(factory, DB_NAME)
    expect(await factory.databases()).toEqual([])
  })
})
