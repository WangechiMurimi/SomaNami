import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSupabaseClient } from '../../lib/auth/supabase-client.ts'
import { createFakeStorageClient } from '../../lib/storage-cloud/testing/fake-storage-client.ts'
import {
  createMemoryAdapter,
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
afterEach(() => setSupabaseClient(undefined))

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
})

describe('useLibrary original files', () => {
  const original = new File(['Alpha'], 'Alpha.txt', { type: 'text/plain' })

  async function ready() {
    const hook = renderHook(() => useLibrary())
    await waitFor(() => expect(hook.result.current.status).toBe('ready'))
    return hook
  }

  it('uploads the original to the learner’s folder and records the path', async () => {
    const fake = createFakeStorageClient({ userId: 'user-a' })
    setSupabaseClient(fake.client)
    const { result } = await ready()

    await act(() =>
      result.current.add(doc('a', 'Alpha.txt'), undefined, original),
    )

    await waitFor(() =>
      expect(result.current.documents[0]?.storagePath).toBe(
        'user-a/a/Alpha.txt',
      ),
    )
    expect(fake.objects.get('user-a/a/Alpha.txt')).toBe(original)
    expect((await getDocument('a'))?.storagePath).toBe('user-a/a/Alpha.txt')
  })

  it('uploads nothing when no file is given', async () => {
    const fake = createFakeStorageClient()
    setSupabaseClient(fake.client)
    const { result } = await ready()

    await act(() => result.current.add(doc('a', 'Alpha.txt')))

    expect(fake.upload).not.toHaveBeenCalled()
  })

  it('keeps the material on this device when Supabase is not configured', async () => {
    setSupabaseClient(null)
    const { result } = await ready()

    const stored = await act(() =>
      result.current.add(doc('a', 'Alpha.txt'), undefined, original),
    )

    expect(stored.storagePath).toBeUndefined()
    expect(await getDocument('a')).toMatchObject({ id: 'a' })
  })

  it('keeps the material when the upload fails, and says why in the console', async () => {
    setSupabaseClient(
      createFakeStorageClient({ uploadError: 'offline' }).client,
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = await ready()

    await act(() =>
      result.current.add(doc('a', 'Alpha.txt'), undefined, original),
    )

    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(warn.mock.calls[0]?.[0]).toBe('Could not upload the original file')
    expect((await getDocument('a'))?.storagePath).toBeUndefined()
    expect(result.current.documents).toHaveLength(1)
    warn.mockRestore()
  })

  it('does not bring back a material deleted while its file uploaded', async () => {
    const fake = createFakeStorageClient({ userId: 'user-a' })
    let finishUpload = () => {}
    fake.upload.mockImplementationOnce(
      (path: string) =>
        new Promise((resolve) => {
          finishUpload = () => resolve({ data: { path }, error: null })
        }),
    )
    setSupabaseClient(fake.client)
    const { result } = await ready()

    await act(() =>
      result.current.add(doc('a', 'Alpha.txt'), undefined, original),
    )
    await waitFor(() => expect(fake.upload).toHaveBeenCalled())
    await act(() => result.current.remove('a'))
    await act(async () => finishUpload())

    await waitFor(() =>
      expect(fake.remove).toHaveBeenCalledWith(['user-a/a/Alpha.txt']),
    )
    expect(await getDocument('a')).toBeUndefined()
    expect(result.current.documents).toEqual([])
  })
})
