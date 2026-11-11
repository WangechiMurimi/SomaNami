import { describe, expect, it } from 'vitest'
import { ACCEPT_ATTRIBUTE, MAX_FILE_BYTES } from './constants.ts'
import { validateFile, verifyContents } from './validate-file.ts'
import type { ContentCheck, FileProblem, Validation } from './validate-file.ts'

// `validateFile` reads only the name and size, so a stub stands in for a File
// (a real one would need `size` bytes of content for the limit tests).
const fileOf = (name: string, size = 10) => ({ name, size }) as File
const bytesFile = (bytes: number[], name: string) =>
  new File([new Uint8Array(bytes)], name)
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))

/** Returns the rejection's problem, failing the test if the file was accepted. */
function problemOf(result: Validation | ContentCheck): FileProblem {
  if (result.ok) throw new Error('Expected the file to be rejected')
  return result.error
}

const ZIP = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]

describe('validateFile', () => {
  it.each([
    ['notes.pdf', 'pdf'],
    ['NOTES.PDF', 'pdf'],
    ['essay.docx', 'docx'],
    ['Essay.DOCX', 'docx'],
    ['notes.txt', 'text'],
    ['readme.md', 'text'],
  ])('accepts %s', (name, kind) => {
    expect(validateFile(fileOf(name))).toEqual({ ok: true, kind })
  })

  it.each(['old.doc', 'slides.pptx', 'slides.ppt'])(
    'names planned format %s instead of calling it invalid',
    (name) => {
      const error = problemOf(validateFile(fileOf(name)))
      expect(error.code).toBe('unsupported-planned')
      expect(error.message).toContain(name.slice(name.lastIndexOf('.')))
    },
  )

  it.each(['image.png', 'no-extension', 'archive.pdf.zip'])(
    'rejects %s and lists what is supported',
    (name) => {
      const error = problemOf(validateFile(fileOf(name)))
      expect(error.code).toBe('unsupported-type')
      expect(error.message).toBe(
        'We can only read PDF, DOCX, TXT or Markdown files right now.',
      )
    },
  )

  it('rejects empty files', () => {
    expect(problemOf(validateFile(fileOf('a.txt', 0))).code).toBe('empty')
  })

  it('allows exactly the size limit and rejects one byte over', () => {
    expect(validateFile(fileOf('a.pdf', MAX_FILE_BYTES)).ok).toBe(true)
    expect(
      problemOf(validateFile(fileOf('a.pdf', MAX_FILE_BYTES + 1))).code,
    ).toBe('too-large')
  })
})

describe('ACCEPT_ATTRIBUTE', () => {
  it('offers every supported extension in the file picker', () => {
    expect(ACCEPT_ATTRIBUTE.split(',')).toEqual([
      '.pdf',
      '.docx',
      '.txt',
      '.md',
    ])
  })
})

describe('verifyContents', () => {
  it('accepts a PDF header, including after leading bytes', async () => {
    expect(
      await verifyContents(bytesFile(ascii('%PDF-1.7'), 'a.pdf'), 'pdf'),
    ).toEqual({ ok: true })
    const padded = [...new Array(100).fill(0x20), ...ascii('%PDF-1.4')]
    expect((await verifyContents(bytesFile(padded, 'a.pdf'), 'pdf')).ok).toBe(
      true,
    )
  })

  it('rejects a PNG renamed to .pdf', async () => {
    const error = problemOf(
      await verifyContents(bytesFile(PNG, 'photo.pdf'), 'pdf'),
    )
    expect(error.code).toBe('content-mismatch')
    expect(error.message).toMatch(/named as a PDF.*renamed or damaged/)
  })

  it('rejects a PDF header found past the first 1 KB', async () => {
    const late = [...new Array(1100).fill(0x20), ...ascii('%PDF-1.4')]
    const error = problemOf(
      await verifyContents(bytesFile(late, 'a.pdf'), 'pdf'),
    )
    expect(error.code).toBe('content-mismatch')
  })

  it('accepts a ZIP package as .docx', async () => {
    expect(await verifyContents(bytesFile(ZIP, 'a.docx'), 'docx')).toEqual({
      ok: true,
    })
  })

  it('explains encrypted or legacy Word files instead of calling them damaged', async () => {
    const error = problemOf(
      await verifyContents(bytesFile(OLE, 'a.docx'), 'docx'),
    )
    expect(error.code).toBe('docx-protected-or-legacy')
    expect(error.message).toMatch(/password-protected.*\.docx/)
  })

  it('rejects plain text renamed to .docx', async () => {
    const error = problemOf(
      await verifyContents(new File(['hello'], 'a.docx'), 'docx'),
    )
    expect(error.code).toBe('content-mismatch')
  })

  it('accepts UTF-8 text and rejects binary data named .txt', async () => {
    expect(
      (await verifyContents(new File(['héllo ✓'], 'a.txt'), 'text')).ok,
    ).toBe(true)
    const error = problemOf(
      await verifyContents(bytesFile(PNG, 'a.txt'), 'text'),
    )
    expect(error.code).toBe('content-mismatch')
  })
})
