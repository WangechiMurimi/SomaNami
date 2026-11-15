import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { StorageAdapter, StorageRecord } from './adapter.ts'
import {
  declineLegacyImport,
  hasLegacyMaterials,
  legacyImportDeclined,
  moveLegacyMaterials,
} from './import-legacy.ts'
import { createIndexedDbAdapter } from './indexeddb-adapter.ts'
import {
  CONVERSATIONS,
  DB_NAME,
  DEFAULT_WORKSPACE,
  DOCUMENTS,
  MESSAGES,
  WORKSPACES,
} from './schema.ts'
import type { StoreName } from './schema.ts'
import { ADAPTERS } from './test-adapters.ts'

// Loose records: the move copies whatever is stored, whatever its shape.
const RECORDS: Record<
  StoreName,
  Array<StorageRecord & Record<string, unknown>>
> = {
  [WORKSPACES]: [],
  [DOCUMENTS]: [
    { id: 'doc-1', name: 'a.txt', size: 1, kind: 'text', chunks: [] },
    { id: 'doc-2', name: 'b.txt', size: 1, kind: 'text', chunks: [] },
  ],
  [CONVERSATIONS]: [
    {
      id: 'conv-1',
      documentId: 'doc-1',
      title: 'T',
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  [MESSAGES]: [
    {
      id: 'msg-1',
      conversationId: 'conv-1',
      role: 'user',
      content: 'hi',
      createdAt: 1,
    },
    {
      id: 'msg-2',
      conversationId: 'conv-1',
      role: 'user',
      content: 'yo',
      createdAt: 2,
    },
  ],
}

async function seedLegacy(
  factory: IDBFactory,
  records: Partial<typeof RECORDS> = RECORDS,
) {
  const legacy = createIndexedDbAdapter(factory, { name: DB_NAME })
  for (const [storeName, rows] of Object.entries(records))
    for (const row of rows) await legacy.put(storeName as StoreName, row)
  await legacy.close()
}

const databaseNames = async (factory: IDBFactory) =>
  (await factory.databases()).map((info) => info.name)

async function legacyIds(factory: IDBFactory, storeName: StoreName) {
  const legacy = createIndexedDbAdapter(factory, { name: DB_NAME })
  const rows = await legacy.getAll(storeName)
  await legacy.close()
  return rows.map((row) => row.id)
}

describe('hasLegacyMaterials', () => {
  it('is false without IndexedDB', async () => {
    expect(await hasLegacyMaterials(undefined)).toBe(false)
  })

  it('is false when there is no legacy database, and does not create one', async () => {
    const factory = new IDBFactory()
    expect(await hasLegacyMaterials(factory)).toBe(false)
    expect(await databaseNames(factory)).toEqual([])
  })

  it('is false when the legacy database is empty', async () => {
    const factory = new IDBFactory()
    await seedLegacy(factory, {})
    expect(await hasLegacyMaterials(factory)).toBe(false)
  })

  it.each([DOCUMENTS, CONVERSATIONS, MESSAGES])(
    'is true when the legacy database holds %s',
    async (storeName) => {
      const factory = new IDBFactory()
      await seedLegacy(factory, { [storeName]: RECORDS[storeName] })
      expect(await hasLegacyMaterials(factory)).toBe(true)
    },
  )
})

describe.each(ADAPTERS)(
  'moveLegacyMaterials into a %s store',
  (_name, makeAdapter) => {
    let factory: IDBFactory
    let target: StorageAdapter
    beforeEach(async () => {
      factory = new IDBFactory()
      target = makeAdapter()
      await seedLegacy(factory)
    })

    it('copies all three stores, then deletes the legacy database', async () => {
      await moveLegacyMaterials({ factory, target })

      for (const storeName of [DOCUMENTS, CONVERSATIONS, MESSAGES]) {
        expect(await target.getAll(storeName)).toEqual(RECORDS[storeName])
      }
      expect(await databaseNames(factory)).not.toContain(DB_NAME)
      expect(await hasLegacyMaterials(factory)).toBe(false)
    })

    it('finishes even while a tab from before accounts holds the old database', async () => {
      // That version never closes its connection when asked to.
      const oldTab = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(DB_NAME)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })

      await moveLegacyMaterials({ factory, target })
      expect(await target.getAll(DOCUMENTS)).toEqual(RECORDS[DOCUMENTS])

      // The queued delete completes once that tab goes away.
      oldTab.close()
      await expect.poll(() => databaseNames(factory)).not.toContain(DB_NAME)
    })

    it('keeps what the user already had', async () => {
      const own = {
        id: 'doc-own',
        name: 'own.txt',
        size: 1,
        kind: 'text',
        chunks: [],
      }
      await target.put(DOCUMENTS, own)
      await moveLegacyMaterials({ factory, target })
      expect((await target.getAll(DOCUMENTS)).map((d) => d.id)).toEqual([
        'doc-1',
        'doc-2',
        'doc-own',
      ])
    })

    it('leaves the legacy database intact when a copy fails midway', async () => {
      let puts = 0
      const failing: StorageAdapter = {
        ...target,
        put: (storeName, record) =>
          ++puts === 3
            ? Promise.reject(new Error('QuotaExceededError'))
            : target.put(storeName, record),
      }

      await expect(
        moveLegacyMaterials({ factory, target: failing }),
      ).rejects.toThrow('QuotaExceededError')
      expect(await legacyIds(factory, DOCUMENTS)).toEqual(['doc-1', 'doc-2'])
      expect(await legacyIds(factory, MESSAGES)).toEqual(['msg-1', 'msg-2'])
      expect(await hasLegacyMaterials(factory)).toBe(true)
    })

    it('leaves the legacy database intact when a copy goes missing', async () => {
      // A store that acknowledges writes it never kept: only the check catches it.
      const lossy: StorageAdapter = {
        ...target,
        put: async (storeName, record) =>
          record.id === 'msg-2' ? record.id : target.put(storeName, record),
      }

      await expect(
        moveLegacyMaterials({ factory, target: lossy }),
      ).rejects.toThrow(/did not all arrive/)
      expect(await legacyIds(factory, MESSAGES)).toEqual(['msg-1', 'msg-2'])
    })

    it('can be retried after a failure', async () => {
      const failing: StorageAdapter = {
        ...target,
        put: () => Promise.reject(new Error('offline')),
      }
      await expect(
        moveLegacyMaterials({ factory, target: failing }),
      ).rejects.toThrow()
      await moveLegacyMaterials({ factory, target })
      expect(await target.getAll(MESSAGES)).toHaveLength(2)
    })
  },
)

// Devices that last ran SomaNami before workspaces (#89) still hold a v1
// database: conversations point at one documentId and nothing has a workspace.
describe('moving a v1 legacy database', () => {
  const seedVersionOne = (factory: IDBFactory) =>
    new Promise<void>((resolve, reject) => {
      const request = factory.open(DB_NAME, 1)
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
        request.transaction?.objectStore(MESSAGES).put({
          id: 'm1',
          conversationId: 'c1',
          role: 'user',
          content: 'Why?',
          createdAt: 1,
        })
      }
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })

  it('offers it', async () => {
    const factory = new IDBFactory()
    await seedVersionOne(factory)
    expect(await hasLegacyMaterials(factory)).toBe(true)
  })

  it('arrives filed under the default workspace', async () => {
    const factory = new IDBFactory()
    await seedVersionOne(factory)
    const target = createIndexedDbAdapter(factory, { name: 'somanami-user-u1' })

    await moveLegacyMaterials({ target, factory })

    expect(await target.get(WORKSPACES, DEFAULT_WORKSPACE.id)).toMatchObject({
      name: DEFAULT_WORKSPACE.name,
    })
    expect(await target.get(DOCUMENTS, 'd1')).toMatchObject({
      workspaceId: DEFAULT_WORKSPACE.id,
    })
    const conversation = await target.get(CONVERSATIONS, 'c1')
    expect(conversation).toMatchObject({
      workspaceId: DEFAULT_WORKSPACE.id,
      materialIds: ['d1'],
    })
    expect(conversation).not.toHaveProperty('documentId')
    expect(
      await target.getAllByIndex(CONVERSATIONS, 'materialIds', 'd1'),
    ).toHaveLength(1)
    expect(await target.get(MESSAGES, 'm1')).toBeDefined()
    expect(await databaseNames(factory)).toEqual(['somanami-user-u1'])
    await target.close()
  })
})

describe('declining the import', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('is remembered per user', () => {
    expect(legacyImportDeclined('ada')).toBe(false)
    declineLegacyImport('ada')
    expect(legacyImportDeclined('ada')).toBe(true)
    expect(legacyImportDeclined('ben')).toBe(false)
    expect(localStorage.getItem('somanami-legacy-import:ada')).toBe('declined')
  })
})
