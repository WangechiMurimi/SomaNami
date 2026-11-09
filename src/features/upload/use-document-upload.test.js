import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { parseDocument } from './parse-document.js'
import { useDocumentUpload } from './use-document-upload.js'

vi.mock('./parse-document.js', async (importOriginal) => ({
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
      name: f.name,
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
