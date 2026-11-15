import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createMemoryAdapter,
  createWorkspace,
  DEFAULT_WORKSPACE,
  getDocument,
  listDocuments,
  saveDocument,
  setStorageAdapter,
} from '../../lib/storage/index.ts'
import type { NewDocument } from '../../types/contracts.ts'
import { useLibrary } from './use-library.ts'

const doc = (id: string, name: string): NewDocument => ({
  id,
  name,
  size: 1,
  kind: 'text',
  pageCount: null,
  chunks: [],
})

beforeEach(() => setStorageAdapter(createMemoryAdapter()))

describe('useLibrary', () => {
  it('loads the documents already stored on this device', async () => {
    await saveDocument(doc('b', 'Beta.txt'))
    await saveDocument(doc('a', 'Alpha.txt'))

    const { result } = renderHook(() => useLibrary())

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.documents.map((d) => d.name)).toEqual([
      'Alpha.txt',
      'Beta.txt',
    ])
  })

  it('saves an added document and lists it in name order', async () => {
    await saveDocument(doc('b', 'Beta.txt'))
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(() => result.current.add(doc('a', 'Alpha.txt')))

    expect(result.current.documents.map((d) => d.id)).toEqual(['a', 'b'])
    expect(await listDocuments()).toHaveLength(2)
  })

  it('replaces a document added again under the same id', async () => {
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(() => result.current.add(doc('a', 'Alpha.txt')))
    await act(() => result.current.add(doc('a', 'Alpha v2.txt')))

    expect(result.current.documents.map((d) => d.name)).toEqual([
      'Alpha v2.txt',
    ])
  })

  it('moves a document to another workspace and keeps it listed', async () => {
    await saveDocument(doc('a', 'Alpha.txt'))
    const workspace = await createWorkspace({ name: 'Biology' })
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(() => result.current.move('a', workspace.id))
    expect(result.current.documents[0]?.workspaceId).toBe(workspace.id)

    await act(() => result.current.move('a', DEFAULT_WORKSPACE.id))
    expect(result.current.documents).toHaveLength(1)
    expect((await getDocument('a'))?.workspaceId).toBe(DEFAULT_WORKSPACE.id)
  })

  it('drops a deleted workspace’s documents and keeps the rest', async () => {
    const workspace = await createWorkspace({ name: 'Biology' })
    await saveDocument(doc('a', 'Alpha.txt'), workspace.id)
    await saveDocument(doc('b', 'Beta.txt'))
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(() => result.current.removeWorkspace(workspace.id))

    expect(result.current.documents.map((d) => d.id)).toEqual(['b'])
    expect(await getDocument('a')).toBeUndefined()
  })
})
