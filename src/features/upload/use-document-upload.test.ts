import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { parseDocument } from './parse-document.ts'
import { useDocumentUpload } from './use-document-upload.ts'
import { UploadError } from './upload-error.ts'

vi.mock('./parse-document.ts', async (importOriginal) => ({
  ...(await importOriginal()),
  parseDocument: vi.fn(),
}))

const file = new File(['x'], 'notes.txt')

describe('useDocumentUpload', () => {
  it('hides unexpected errors behind a retryable message and logs them', async () => {
    const bug = new TypeError('x is not a function')
    vi.mocked(parseDocument).mockImplementation(async () => {
      throw bug
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useDocumentUpload())

    await act(() => result.current.upload(file))

    expect(result.current.status).toBe('error')
    expect(result.current.error).toEqual({
      code: 'unknown',
      message: 'Something went wrong while reading that file.',
      stage: 'processing',
      retryable: true,
    })
    expect(log).toHaveBeenCalledWith('Unexpected upload failure', bug)
    log.mockRestore()
  })

  it('retries the last file, and reset forgets it', async () => {
    vi.mocked(parseDocument).mockImplementation(async (f) => ({
      id: 'd1',
      name: f.name,
      size: f.size,
      kind: 'text',
      pageCount: null,
      chunks: [],
    }))
    const { result } = renderHook(() => useDocumentUpload())

    await act(() => result.current.upload(file))
    await act(() => result.current.retry())
    expect(parseDocument).toHaveBeenLastCalledWith(file)
    expect(parseDocument).toHaveBeenCalledTimes(2)

    act(() => result.current.reset())
    await act(() => result.current.retry())
    expect(parseDocument).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('idle')
  })
})

describe('useDocumentUpload onReady', () => {
  const parsed = {
    id: 'd1',
    name: 'notes.txt',
    size: 1,
    kind: 'text' as const,
    pageCount: null,
    chunks: [],
  }

  it('hands the parsed document to onReady before showing it as ready', async () => {
    vi.mocked(parseDocument).mockResolvedValue(parsed)
    const onReady = vi.fn()
    const { result } = renderHook(() => useDocumentUpload({ onReady }))

    await act(() => result.current.upload(file))

    expect(onReady).toHaveBeenCalledWith(parsed)
    expect(result.current.status).toBe('ready')
  })

  it('reports the upload as failed when onReady throws', async () => {
    vi.mocked(parseDocument).mockResolvedValue(parsed)
    const onReady = vi
      .fn()
      .mockRejectedValue(
        new UploadError('save-failed', 'Could not save.', { retryable: true }),
      )
    const { result } = renderHook(() => useDocumentUpload({ onReady }))

    await act(() => result.current.upload(file))

    expect(result.current.status).toBe('error')
    expect(result.current.error).toMatchObject({
      code: 'save-failed',
      retryable: true,
    })
  })
})
