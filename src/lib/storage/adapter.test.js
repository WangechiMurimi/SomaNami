import { beforeEach, describe, expect, it } from 'vitest'
import { CONVERSATIONS, DOCUMENTS, MESSAGES, STORES } from './schema.js'
import { ADAPTERS } from './test-adapters.js'

// One contract, both adapters: if the in-memory double drifts from real
// IndexedDB, these assertions are where it shows up.
describe.each(ADAPTERS)('%s adapter', (_name, makeAdapter) => {
  let adapter

  beforeEach(() => {
    adapter = makeAdapter()
  })

  it('opens a store for every store in the schema', async () => {
    for (const { name } of STORES)
      expect(await adapter.getAll(name)).toEqual([])
  })

  it('returns undefined for a key that was never written', async () => {
    expect(await adapter.get(DOCUMENTS, 'missing')).toBeUndefined()
  })

  it('round-trips a nested record and detaches it from the caller', async () => {
    const record = {
      id: 'd1',
      chunks: [{ id: 0, source: { type: 'page', page: 1 } }],
    }
    await adapter.put(DOCUMENTS, record)

    record.chunks[0].source.page = 99
    record.chunks.push({ id: 1 })

    expect(await adapter.get(DOCUMENTS, 'd1')).toEqual({
      id: 'd1',
      chunks: [{ id: 0, source: { type: 'page', page: 1 } }],
    })
  })

  it('does not let a later mutation of a returned record reach the store', async () => {
    await adapter.put(DOCUMENTS, { id: 'd1', name: 'original' })

    const first = await adapter.get(DOCUMENTS, 'd1')
    first.name = 'tampered'

    expect((await adapter.get(DOCUMENTS, 'd1')).name).toBe('original')
  })

  it('replaces a record written twice under the same key', async () => {
    await adapter.put(DOCUMENTS, { id: 'd1', name: 'first' })
    await adapter.put(DOCUMENTS, { id: 'd1', name: 'second' })

    expect(await adapter.getAll(DOCUMENTS)).toEqual([
      { id: 'd1', name: 'second' },
    ])
  })

  it('returns the written key from put', async () => {
    expect(await adapter.put(DOCUMENTS, { id: 'd1' })).toBe('d1')
  })

  it('lists a store ordered by primary key', async () => {
    for (const id of ['c', 'a', 'b']) await adapter.put(DOCUMENTS, { id })

    expect(
      (await adapter.getAll(DOCUMENTS)).map((record) => record.id),
    ).toEqual(['a', 'b', 'c'])
  })

  it('reads records back by index', async () => {
    await adapter.put(MESSAGES, { id: 'm1', conversationId: 'c1' })
    await adapter.put(MESSAGES, { id: 'm2', conversationId: 'c2' })

    expect(
      await adapter.getAllByIndex(MESSAGES, 'conversationId', 'c1'),
    ).toEqual([{ id: 'm1', conversationId: 'c1' }])
  })

  it('returns an index match ordered by primary key', async () => {
    for (const id of ['m3', 'm1', 'm2'])
      await adapter.put(MESSAGES, { id, conversationId: 'c1' })

    const ids = (
      await adapter.getAllByIndex(MESSAGES, 'conversationId', 'c1')
    ).map((record) => record.id)
    expect(ids).toEqual(['m1', 'm2', 'm3'])
  })

  it('returns an empty list for an index value nothing matches', async () => {
    expect(
      await adapter.getAllByIndex(MESSAGES, 'conversationId', 'nobody'),
    ).toEqual([])
  })

  // `IDBIndex.getAll(undefined)` means "no query" and matches everything, so an
  // undefined id would make removeByIndex empty the store. Both adapters refuse.
  it.each([undefined, null])(
    'refuses an index lookup for %s',
    async (value) => {
      await adapter.put(MESSAGES, { id: 'm1', conversationId: 'c1' })

      await expect(
        adapter.getAllByIndex(MESSAGES, 'conversationId', value),
      ).rejects.toThrow(TypeError)
      await expect(
        adapter.removeByIndex(MESSAGES, 'conversationId', value),
      ).rejects.toThrow(TypeError)
      expect(await adapter.getAll(MESSAGES)).toHaveLength(1)
    },
  )

  it('removes one record by key without touching its neighbours', async () => {
    await adapter.put(DOCUMENTS, { id: 'd1' })
    await adapter.put(DOCUMENTS, { id: 'd2' })

    await adapter.remove(DOCUMENTS, 'd1')

    expect(await adapter.getAll(DOCUMENTS)).toEqual([{ id: 'd2' }])
  })

  it('ignores removing a key that is not there', async () => {
    await expect(adapter.remove(DOCUMENTS, 'missing')).resolves.toBeUndefined()
  })

  it('removes a whole index match in one call', async () => {
    await adapter.put(CONVERSATIONS, { id: 'c1', documentId: 'd1' })
    await adapter.put(CONVERSATIONS, { id: 'c2', documentId: 'd1' })
    await adapter.put(CONVERSATIONS, { id: 'c3', documentId: 'd2' })

    await adapter.removeByIndex(CONVERSATIONS, 'documentId', 'd1')

    expect(await adapter.getAll(CONVERSATIONS)).toEqual([
      { id: 'c3', documentId: 'd2' },
    ])
  })

  it('ignores removing an index value nothing matches', async () => {
    await adapter.put(CONVERSATIONS, { id: 'c1', documentId: 'd1' })

    await adapter.removeByIndex(CONVERSATIONS, 'documentId', 'nobody')

    expect(await adapter.getAll(CONVERSATIONS)).toHaveLength(1)
  })

  it('keeps stores independent of each other', async () => {
    await adapter.put(DOCUMENTS, { id: 'shared' })
    await adapter.put(CONVERSATIONS, { id: 'shared', documentId: 'd1' })

    await adapter.remove(DOCUMENTS, 'shared')

    expect(await adapter.getAll(CONVERSATIONS)).toHaveLength(1)
  })

  it('rejects an unknown store rather than silently returning nothing', async () => {
    await expect(adapter.getAll('nope')).rejects.toThrow()
  })

  it('rejects an unknown index rather than silently returning nothing', async () => {
    await expect(
      adapter.getAllByIndex(DOCUMENTS, 'name', 'x'),
    ).rejects.toThrow()
  })

  it('closes without error, so callers can treat adapters alike', async () => {
    await adapter.put(DOCUMENTS, { id: 'd1' })
    await expect(adapter.close()).resolves.toBeUndefined()
  })
})
