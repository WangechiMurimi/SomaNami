import { describe, expect, it } from 'vitest'
import {
  MATERIALS_BUCKET,
  originalPath,
  removeOriginal,
  uploadOriginal,
  type UploadOriginalOptions,
} from './originals.ts'
import {
  createFakeStorageClient,
  type FakeStorageOptions,
} from './testing/fake-storage-client.ts'

const file = new File(['%PDF-1.7'], 'cells.pdf', { type: 'application/pdf' })
const LIMIT = 1024

describe('originalPath', () => {
  it('places the file under the user and the document', () => {
    expect(originalPath('u1', 'd1', 'cells.pdf')).toBe('u1/d1/cells.pdf')
  })

  it('makes names the storage service would refuse safe', () => {
    expect(originalPath('u1', 'd1', 'Biología básica.pdf')).toBe(
      'u1/d1/Biologia basica.pdf',
    )
    expect(originalPath('u1', 'd1', 'a/../b?.txt')).toBe('u1/d1/a_.._b_.txt')
    expect(originalPath('u1', 'd1', '..')).toBe('u1/d1/file')
  })

  it('keeps the extension of a very long name', () => {
    const path = originalPath('u1', 'd1', `${'x'.repeat(300)}.docx`)
    expect(path.endsWith('.docx')).toBe(true)
    expect(path.length).toBeLessThanOrEqual('u1/d1/'.length + 120)
  })
})

describe('uploadOriginal', () => {
  it('uploads to the signed-in user’s folder and returns the path', async () => {
    const fake = createFakeStorageClient({ userId: 'user-a' })

    const path = await uploadOriginal('doc-1', file, {
      maxBytes: LIMIT,
      client: fake.client,
      online: true,
    })

    expect(path).toBe('user-a/doc-1/cells.pdf')
    expect(fake.from).toHaveBeenCalledWith(MATERIALS_BUCKET)
    expect(fake.upload).toHaveBeenCalledWith('user-a/doc-1/cells.pdf', file, {
      upsert: true,
      contentType: 'application/pdf',
    })
  })

  it('falls back to a generic type when the browser gives none', async () => {
    const fake = createFakeStorageClient()
    await uploadOriginal('doc-1', new File(['x'], 'notes'), {
      maxBytes: LIMIT,
      client: fake.client,
      online: true,
    })
    expect(fake.upload.mock.calls[0]?.[2]).toMatchObject({
      contentType: 'application/octet-stream',
    })
  })

  it.each<[string, FakeStorageOptions, Partial<UploadOriginalOptions>]>([
    ['Supabase is not configured', {}, { client: null }],
    ['the browser is offline', {}, { online: false }],
    ['nobody is signed in', { userId: null }, {}],
  ])('does nothing when %s', async (_, session, options) => {
    const fake = createFakeStorageClient(session)
    const path = await uploadOriginal('doc-1', file, {
      maxBytes: LIMIT,
      client: fake.client,
      online: true,
      ...options,
    })
    expect(path).toBeNull()
    expect(fake.upload).not.toHaveBeenCalled()
  })

  it('skips files over the size limit', async () => {
    const fake = createFakeStorageClient()
    const path = await uploadOriginal('doc-1', file, {
      maxBytes: file.size - 1,
      client: fake.client,
      online: true,
    })
    expect(path).toBeNull()
    expect(fake.upload).not.toHaveBeenCalled()
  })

  it('rejects when the upload fails', async () => {
    const fake = createFakeStorageClient({ uploadError: 'Payload too large' })
    await expect(
      uploadOriginal('doc-1', file, {
        maxBytes: LIMIT,
        client: fake.client,
        online: true,
      }),
    ).rejects.toThrow('Payload too large')
  })
})

describe('removeOriginal', () => {
  it('deletes the object at the path', async () => {
    const fake = createFakeStorageClient()
    fake.objects.set('u/d/cells.pdf', file)

    await removeOriginal('u/d/cells.pdf', fake.client)

    expect(fake.remove).toHaveBeenCalledWith(['u/d/cells.pdf'])
    expect(fake.objects.size).toBe(0)
  })

  it('does nothing when Supabase is not configured', async () => {
    await expect(removeOriginal('u/d/cells.pdf', null)).resolves.toBeUndefined()
  })
})
