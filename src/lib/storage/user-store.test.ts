import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  closeUserStore,
  createIndexedDbAdapter,
  createMemoryAdapter,
  DB_NAME,
  DOCUMENTS,
  getDocument,
  importLegacyMaterials,
  isUserStoreOpen,
  listDocuments,
  openUserStore,
  removeUserStore,
  saveDocument,
  setStorageAdapter,
  DEFAULT_WORKSPACE,
  userDbName,
} from './index.ts'
import type { StoredDocument } from '../../types/contracts.ts'

const doc = (id: string): StoredDocument => ({
  id,
  name: `${id}.txt`,
  size: 1,
  kind: 'text',
  pageCount: 1,
  chunks: [],
  workspaceId: DEFAULT_WORKSPACE.id,
})

const databaseNames = async (factory: IDBFactory) =>
  (await factory.databases()).map((info) => info.name)

describe('createIndexedDbAdapter', () => {
  it('keeps the legacy database name when none is given', async () => {
    const factory = new IDBFactory()
    const adapter = createIndexedDbAdapter(factory)
    await adapter.put(DOCUMENTS, doc('a'))
    await adapter.close()
    expect(await databaseNames(factory)).toEqual([DB_NAME])
  })

  it('opens the database it is given a name for', async () => {
    const factory = new IDBFactory()
    const adapter = createIndexedDbAdapter(factory, { name: 'somanami-other' })
    await adapter.put(DOCUMENTS, doc('a'))
    await adapter.close()
    expect(await databaseNames(factory)).toEqual(['somanami-other'])
  })

  it('does not open a database just to close it', async () => {
    const factory = new IDBFactory()
    await createIndexedDbAdapter(factory).close()
    expect(await databaseNames(factory)).toEqual([])
  })
})

describe('userDbName', () => {
  it('names one database per user', () => {
    expect(userDbName('3f2a')).toBe('somanami-user-3f2a')
  })
})

// The app runs on IndexedDB where the browser has it and falls back to memory
// where it does not; both must keep users apart.
describe.each<[string, () => IDBFactory | undefined]>([
  ['indexeddb', () => new IDBFactory()],
  ['memory', () => undefined],
])('user stores on %s', (_name, makeFactory) => {
  beforeEach(() => {
    setStorageAdapter(null)
    vi.stubGlobal('indexedDB', makeFactory())
  })
  afterEach(async () => {
    closeUserStore()
    await removeUserStore('ada')
    await removeUserStore('ben')
    vi.unstubAllGlobals()
  })

  it('refuses storage calls while no user store is open', async () => {
    await expect(listDocuments()).rejects.toThrow(/no user store is open/i)
  })

  it('refuses storage calls again once the store is closed', async () => {
    await openUserStore('ada')
    closeUserStore()
    await expect(listDocuments()).rejects.toThrow(/no user store is open/i)
  })

  it('keeps two users’ materials apart', async () => {
    await openUserStore('ada')
    await saveDocument(doc('ada-notes'))
    closeUserStore()

    await openUserStore('ben')
    expect(await listDocuments()).toEqual([])
    await saveDocument(doc('ben-notes'))
    closeUserStore()

    await openUserStore('ada')
    expect((await listDocuments()).map((d) => d.id)).toEqual(['ada-notes'])
  })

  it('switches straight to the most recently opened user', async () => {
    // Opened back to back, as a fast user switch would.
    const first = openUserStore('ada')
    const second = openUserStore('ben')
    await Promise.all([first, second])

    await saveDocument(doc('ben-notes'))
    closeUserStore()
    await openUserStore('ada')
    expect(await listDocuments()).toEqual([])
  })

  it('removes only the named user’s materials', async () => {
    await openUserStore('ada')
    await saveDocument(doc('ada-notes'))
    closeUserStore()
    await openUserStore('ben')
    await saveDocument(doc('ben-notes'))

    // Removing the open user's store closes it first.
    await removeUserStore('ben')
    await expect(listDocuments()).rejects.toThrow(/no user store is open/i)

    await openUserStore('ben')
    expect(await listDocuments()).toEqual([])
    closeUserStore()
    await openUserStore('ada')
    expect(await getDocument('ada-notes')).toBeDefined()
  })
})

describe('user stores in IndexedDB', () => {
  let factory: IDBFactory
  beforeEach(() => {
    factory = new IDBFactory()
    vi.stubGlobal('indexedDB', factory)
  })
  afterEach(() => {
    closeUserStore()
    vi.unstubAllGlobals()
  })

  it('gives each user a database of their own, never the shared one', async () => {
    await openUserStore('ada')
    await saveDocument(doc('a'))
    expect(await databaseNames(factory)).toEqual([userDbName('ada')])
  })

  it('deletes the user’s database from the device', async () => {
    await openUserStore('ada')
    await saveDocument(doc('a'))
    await removeUserStore('ada')
    expect(await databaseNames(factory)).toEqual([])
  })
})

describe('an injected adapter', () => {
  afterEach(() => setStorageAdapter(null))

  it('bypasses the user scope, so tests need no signed-in user', async () => {
    setStorageAdapter(createMemoryAdapter())
    await saveDocument(doc('a'))
    expect(await listDocuments()).toHaveLength(1)
  })
})

describe('importLegacyMaterials', () => {
  afterEach(() => {
    closeUserStore()
    vi.unstubAllGlobals()
  })

  it('moves the legacy materials into the open user’s database', async () => {
    const factory = new IDBFactory()
    vi.stubGlobal('indexedDB', factory)
    const legacy = createIndexedDbAdapter(factory)
    await legacy.put(DOCUMENTS, doc('old-notes'))
    await legacy.close()

    await openUserStore('ada')
    await importLegacyMaterials()

    expect((await listDocuments()).map((d) => d.id)).toEqual(['old-notes'])
    expect(await databaseNames(factory)).toEqual([userDbName('ada')])
  })

  it('refuses while no user store is open', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    await expect(importLegacyMaterials()).rejects.toThrow(
      /no user store is open/i,
    )
  })
})

describe('isUserStoreOpen', () => {
  afterEach(() => {
    closeUserStore()
    setStorageAdapter(null)
    vi.unstubAllGlobals()
  })

  it('is true only for the user whose store has finished opening', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    const opening = openUserStore('ada')
    expect(isUserStoreOpen('ada')).toBe(false)
    await opening
    expect(isUserStoreOpen('ada')).toBe(true)
    expect(isUserStoreOpen('ben')).toBe(false)
    closeUserStore()
    expect(isUserStoreOpen('ada')).toBe(false)
  })

  it('is true for anyone while a test adapter is injected', () => {
    setStorageAdapter(createMemoryAdapter())
    expect(isUserStoreOpen('ada')).toBe(true)
  })
})

describe('a store removed in another tab', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is not recreated by a tab that still had it open', async () => {
    const factory = new IDBFactory()
    const otherTab = createIndexedDbAdapter(factory, {
      name: userDbName('ada'),
    })
    await otherTab.put(DOCUMENTS, doc('a'))

    vi.stubGlobal('indexedDB', factory)
    await removeUserStore('ada')

    await expect(otherTab.put(DOCUMENTS, doc('b'))).rejects.toThrow(
      /removed from this device/,
    )
    expect(await databaseNames(factory)).toEqual([])
  })
})

describe('a user store that fails to open', () => {
  afterEach(() => {
    closeUserStore()
    vi.unstubAllGlobals()
  })

  it('is not left selected, so later calls fail clearly', async () => {
    const factory = new IDBFactory()
    vi.spyOn(factory, 'open').mockImplementationOnce(() => {
      throw new DOMException('denied', 'InvalidStateError')
    })
    vi.stubGlobal('indexedDB', factory)

    await expect(openUserStore('ada')).rejects.toThrow('denied')
    expect(isUserStoreOpen('ada')).toBe(false)
    await expect(listDocuments()).rejects.toThrow(/no user store is open/i)
  })
})
