// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { linkFileName, MAX_FILE_NAME_CHARS } from './file-name.ts'

const PDF = 'application/pdf'
const HTML = 'text/html'
const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const nameFor = (url: string, type = PDF, disposition?: string) =>
  linkFileName(disposition, new URL(url), type)

describe('linkFileName', () => {
  it('uses the last path segment', () => {
    expect(nameFor('https://example.com/papers/cells.pdf')).toBe('cells.pdf')
  })

  it('ignores a trailing slash and the query', () => {
    expect(nameFor('https://example.com/papers/cells/?x=1', HTML)).toBe(
      'cells.html',
    )
  })

  it('decodes an encoded path segment', () => {
    expect(nameFor('https://example.com/Cell%20Biology.pdf')).toBe(
      'Cell Biology.pdf',
    )
  })

  it('keeps a segment that is not valid percent-encoding', () => {
    expect(nameFor('https://example.com/100%25%zz.pdf')).toBe('100%25%zz.pdf')
  })

  it('falls back to the hostname for a bare domain', () => {
    expect(nameFor('https://example.com/', HTML)).toBe('example.com.html')
  })

  it('makes an IPv6 hostname file-system safe', () => {
    expect(nameFor('https://[2606:4700::1111]/', HTML)).toBe(
      '2606-4700--1111.html',
    )
  })

  describe('Content-Disposition', () => {
    it.each([
      ['attachment; filename="Lecture 3.pdf"', 'Lecture 3.pdf'],
      ['attachment; filename=notes.pdf', 'notes.pdf'],
      ['inline; filename="say \\"hi\\".pdf"', 'say "hi".pdf'],
      [
        'attachment; filename="fallback.pdf"; filename*=UTF-8\'\'%C3%A9t%C3%A9.pdf',
        'été.pdf',
      ],
      ["attachment; filename*=utf-8'en'r%C3%A9sum%C3%A9.pdf", 'résumé.pdf'],
    ])('reads %s', (header, expected) => {
      expect(nameFor('https://example.com/download', PDF, header)).toBe(
        expected,
      )
    })

    it('falls back to the plain name when the encoded one is malformed', () => {
      const header = 'attachment; filename*=UTF-8\'\'%E9%; filename="plain.pdf"'

      expect(nameFor('https://example.com/x', PDF, header)).toBe('plain.pdf')
    })

    it('falls back to the URL when the header names nothing', () => {
      expect(nameFor('https://example.com/a.pdf', PDF, 'attachment')).toBe(
        'a.pdf',
      )
      expect(
        nameFor('https://example.com/a.pdf', PDF, 'attachment; filename=""'),
      ).toBe('a.pdf')
    })
  })

  describe('sanitizing', () => {
    it.each([
      ['../../etc/passwd', '_.._etc_passwd.pdf'],
      ['..\\..\\boot.ini', 'boot.ini.pdf'], // quoted-string escapes leave only dots
      ['.hidden.pdf', 'hidden.pdf'],
      ['bad\u0000name\u001f.pdf', 'badname.pdf'],
      ['invoice‮fdp.exe', 'invoicefdp.exe.pdf'],
      ['  spaced  .pdf ', 'spaced  .pdf'],
    ])('cleans %j to %j', (unsafe, expected) => {
      const header = `attachment; filename="${unsafe}"`

      expect(nameFor('https://example.com/x', PDF, header)).toBe(expected)
    })

    it('falls back when nothing survives cleaning', () => {
      expect(
        nameFor('https://example.com/x', PDF, 'attachment; filename="..."'),
      ).toBe('x.pdf')
    })

    it('caps the length and keeps the extension', () => {
      const name = nameFor(`https://example.com/${'a'.repeat(300)}.pdf`)

      expect(Array.from(name)).toHaveLength(MAX_FILE_NAME_CHARS)
      expect(name.endsWith('.pdf')).toBe(true)
    })

    it('caps by characters, never splitting one in half', () => {
      const name = nameFor(`https://example.com/${'é'.repeat(300)}`, HTML)

      expect(Array.from(name)).toHaveLength(MAX_FILE_NAME_CHARS)
      expect(name.endsWith('é.html')).toBe(true)
    })
  })

  describe('extensions', () => {
    it.each([
      ['https://example.com/report', PDF, 'report.pdf'],
      ['https://example.com/wiki/Node.js', HTML, 'Node.js.html'],
      ['https://example.com/page.htm', HTML, 'page.htm'],
      [
        'https://example.com/page.php',
        'application/xhtml+xml',
        'page.php.html',
      ],
      ['https://example.com/essay', DOCX, 'essay.docx'],
      ['https://example.com/readme', 'text/plain', 'readme.txt'],
      ['https://example.com/README.md', 'text/plain', 'README.md'],
      ['https://example.com/notes', 'text/markdown', 'notes.md'],
      ['https://example.com/PAPER.PDF', PDF, 'PAPER.PDF'],
      ['https://example.com/blob.bin', 'application/octet-stream', 'blob.bin'],
      ['https://example.com/blob', 'application/octet-stream', 'blob'],
    ])('names %s (%s) %s', (url, type, expected) => {
      expect(nameFor(url, type)).toBe(expected)
    })
  })
})
