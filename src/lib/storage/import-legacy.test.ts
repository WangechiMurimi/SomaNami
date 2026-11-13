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
import { CONVERSATIONS, DB_NAME, DOCUMENTS, MESSAGES } from './schema.ts'
import type { StoreName } from './schema.ts'
import { ADAPTERS } from './test-adapters.ts'

// Loose records: the move copies whatever is stored, whatever its shape.
const RECORDS: Record<
  StoreName,
  Array<StorageRecord & Record<string, unknown>>
> = {
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
