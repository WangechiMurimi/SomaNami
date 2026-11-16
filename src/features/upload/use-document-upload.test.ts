import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { fetchLink } from './fetch-link.ts'
import { parseDocument } from './parse-document.ts'
import { useDocumentUpload } from './use-document-upload.ts'
import { UploadError } from './upload-error.ts'

vi.mock('./fetch-link.ts', () => ({ fetchLink: vi.fn() }))
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

describe('useDocumentUpload links', () => {
  const page = new File(['Leaves make sugar.'], 'leaves.txt')
  const parsed = {
    id: 'd2',
    name: 'leaves.txt',
    size: 18,
    kind: 'text' as const,
    pageCount: null,
    chunks: [],
  }

  it('fetches, then parses with where the link ended up', async () => {
    vi.mocked(fetchLink).mockResolvedValue({
      file: page,
      finalUrl: 'https://example.org/leaves.txt',
    })
    vi.mocked(parseDocument).mockResolvedValue(parsed)
    const onReady = vi.fn()
    const { result } = renderHook(() => useDocumentUpload({ onReady }))

    let pending!: Promise<void>
    act(() => {
      pending = result.current.uploadLink('https://example.org/leaves')
    })
    expect(result.current).toMatchObject({
      status: 'processing',
      fileName: 'https://example.org/leaves',
      fetching: true,
    })
    await act(() => pending)

    expect(fetchLink).toHaveBeenCalledWith('https://example.org/leaves')
    expect(parseDocument).toHaveBeenLastCalledWith(page, {
      sourceUrl: 'https://example.org/leaves.txt',
      fetchedAt: expect.any(Number),
    })
    expect(onReady).toHaveBeenCalledWith(parsed)
    expect(result.current.status).toBe('ready')
  })

  it('explains a page with no readable text in web terms', async () => {
    vi.mocked(fetchLink).mockResolvedValue({ file: page, finalUrl: 'x' })
    vi.mocked(parseDocument).mockRejectedValue(
      new UploadError('no-text', 'Scanned documents need text recognition.'),
    )
    const { result } = renderHook(() => useDocumentUpload())

    await act(() => result.current.uploadLink('https://example.org/app'))

    expect(result.current.error?.code).toBe('no-text')
    expect(result.current.error?.message).toMatch(/Paste text instead/)
    expect(result.current.error?.message).not.toMatch(/Scanned/)
  })

  it('shows a fetch failure and retries the same link', async () => {
    vi.mocked(fetchLink)
      .mockRejectedValueOnce(
        new UploadError('timeout', 'Too slow.', { retryable: true }),
      )
      .mockResolvedValueOnce({ file: page, finalUrl: 'x' })
    vi.mocked(parseDocument).mockResolvedValue(parsed)
    const { result } = renderHook(() => useDocumentUpload())

    await act(() => result.current.uploadLink('https://example.org/slow'))
    expect(result.current).toMatchObject({
      status: 'error',
      fileName: 'https://example.org/slow',
      error: { code: 'timeout', retryable: true },
    })

    await act(() => result.current.retry())
    expect(fetchLink).toHaveBeenLastCalledWith('https://example.org/slow')
    expect(result.current.status).toBe('ready')
  })

  it('ignores an empty link', async () => {
    vi.mocked(fetchLink).mockClear()
    const { result } = renderHook(() => useDocumentUpload())
    await act(() => result.current.uploadLink(''))
    expect(fetchLink).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })
})
