import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_FILE_BYTES, SUPPORTED_EXTENSIONS } from './constants.js'
import { parseDocx } from './parse-docx.js'
import { parseDocument, PARSERS, UploadError } from './parse-document.js'
import { parsePdf } from './parse-pdf.js'

vi.mock('./parse-pdf.js', () => ({ parsePdf: vi.fn() }))
vi.mock('./parse-docx.js', () => ({ parseDocx: vi.fn() }))

const rejection = (promise) =>
  promise.then(
    () => null,
    (error) => error,
  )

const pdfFile = () => new File(['%PDF-1.7\n'], 'notes.pdf')
const docxFile = () =>
  new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'essay.docx')

describe('parseDocument', () => {
  beforeEach(() => {
    vi.mocked(parsePdf).mockReset()
    vi.mocked(parseDocx).mockReset()
  })

  it('registers a parser for every supported kind', () => {
    for (const kind of Object.values(SUPPORTED_EXTENSIONS)) {
      expect(PARSERS[kind], kind).toBeTypeOf('function')
    }
  })

  it('builds a document with ids and source-referenced chunks', async () => {
    const doc = await parseDocument(new File(['hello\n\nworld'], 'notes.txt'))
    expect(doc).toMatchObject({ name: 'notes.txt', kind: 'text' })
    expect(doc.chunks.map((c) => c.id)).toEqual([0, 1])
    expect(doc.chunks[1].source).toMatchObject({ type: 'lines', startLine: 3 })
  })

  it('routes .docx files to the DOCX parser', async () => {
    vi.mocked(parseDocx).mockResolvedValue({
      chunks: [{ text: 'Hi', source: { type: 'paragraph', paragraph: 1 } }],
      pageCount: null,
    })
    const doc = await parseDocument(docxFile())
    expect(doc).toMatchObject({ kind: 'docx', name: 'essay.docx' })
    expect(doc.chunks[0].source).toEqual({ type: 'paragraph', paragraph: 1 })
  })

  it('surfaces name and size failures as validation errors', async () => {
    const error = await rejection(parseDocument(new File(['x'], 'a.png')))
    expect(error).toBeInstanceOf(UploadError)
    expect(error).toMatchObject({
      code: 'unsupported-type',
      stage: 'validation',
    })
  })

  it('rejects mismatched contents before any parser runs', async () => {
    const error = await rejection(
      parseDocument(new File(['not a pdf'], 'notes.pdf')),
    )
    expect(error).toMatchObject({
      code: 'content-mismatch',
      stage: 'validation',
    })
    expect(parsePdf).not.toHaveBeenCalled()
  })

  it('rejects an oversized file before reading a single byte of it', async () => {
    const huge = new File(['%PDF-1.7\n'], 'thesis.pdf')
    // Faked rather than allocated: the limit is 20 MB and the check is on size.
    Object.defineProperty(huge, 'size', { value: MAX_FILE_BYTES + 1 })

    const error = await rejection(parseDocument(huge))

    expect(error).toMatchObject({ code: 'too-large', stage: 'validation' })
    expect(error.message).toContain('20 MB')
    expect(parsePdf).not.toHaveBeenCalled()
  })

  it('separates an empty file from one whose text we could not extract', async () => {
    // 0 bytes: nothing was uploaded, so it never reaches a parser.
    const empty = await rejection(parseDocument(new File([], 'a.txt')))
    expect(empty).toMatchObject({ code: 'empty', stage: 'validation' })
    expect(empty.message).toBe('That file is empty.')

    // Has bytes, but no readable text: a parsing outcome, not a bad upload.
    const blank = await rejection(parseDocument(new File([' \n '], 'a.txt')))
    expect(blank).toMatchObject({ code: 'no-text', stage: 'processing' })
    expect(blank.message).toMatch(/no readable text/)
  })

  it('maps parser crashes to a friendly error and keeps the cause', async () => {
    const crash = new Error('InvalidPDFException')
    vi.mocked(parsePdf).mockRejectedValue(crash)

    const error = await rejection(parseDocument(pdfFile()))

    expect(error).toMatchObject({ code: 'parse-failed', stage: 'processing' })
    expect(error.message).not.toContain('InvalidPDF')
    expect(error.cause).toBe(crash)
  })

  it('passes a parser’s own UploadError through unchanged', async () => {
    const unavailable = new UploadError('reader-unavailable', 'offline', {
      retryable: true,
    })
    vi.mocked(parseDocx).mockRejectedValue(unavailable)

    expect(await rejection(parseDocument(docxFile()))).toBe(unavailable)
  })
})
