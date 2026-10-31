import { describe, expect, it, vi } from 'vitest'
import { parseDocument, UploadError } from './parse-document.js'

vi.mock('./parse-pdf.js', () => ({
  parsePdf: vi.fn().mockRejectedValue(new Error('InvalidPDFException')),
}))

const rejection = (promise) =>
  promise.then(
    () => null,
    (error) => error,
  )

describe('parseDocument', () => {
  it('builds a document with ids and source-referenced chunks', async () => {
    const doc = await parseDocument(new File(['hello\n\nworld'], 'notes.txt'))
    expect(doc).toMatchObject({ name: 'notes.txt', kind: 'text' })
    expect(doc.chunks.map((c) => c.id)).toEqual([0, 1])
    expect(doc.chunks[1].source).toMatchObject({ type: 'lines', startLine: 3 })
  })

  it('surfaces validation failures as UploadError', async () => {
    const error = await rejection(parseDocument(new File(['x'], 'a.png')))
    expect(error).toBeInstanceOf(UploadError)
    expect(error.code).toBe('unsupported-type')
  })

  it('reports files with no readable text', async () => {
    const error = await rejection(parseDocument(new File([' \n '], 'a.txt')))
    expect(error.code).toBe('no-text')
  })

  it('maps parser crashes to a friendly parse-failed error', async () => {
    const error = await rejection(parseDocument(new File(['%PDF'], 'bad.pdf')))
    expect(error.code).toBe('parse-failed')
    expect(error.message).not.toContain('InvalidPDF')
  })
})
