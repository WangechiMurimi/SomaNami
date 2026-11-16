// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { linkResponseHeaders } from './link-headers.ts'

const headersFor = (fileName: string) =>
  linkResponseHeaders({
    contentType: 'text/html; charset=utf-8',
    finalUrl: 'https://example.com/a?b=c',
    fileName,
  })

describe('linkResponseHeaders', () => {
  it('carries the type, final URL and an attachment name', () => {
    expect(headersFor('notes.html')).toEqual({
      'Content-Type': 'text/html; charset=utf-8',
      'X-Final-Url': 'https://example.com/a?b=c',
      'Content-Disposition': "attachment; filename*=UTF-8''notes.html",
    })
  })

  it.each([
    ['Lecture 3.pdf', 'Lecture%203.pdf'],
    ['été.pdf', '%C3%A9t%C3%A9.pdf'],
    ["it's (final)*.pdf", 'it%27s%20%28final%29%2A.pdf'],
    ['say "hi"; x.pdf', 'say%20%22hi%22%3B%20x.pdf'],
  ])('encodes %j for RFC 8187', (name, encoded) => {
    expect(headersFor(name)['Content-Disposition']).toBe(
      `attachment; filename*=UTF-8''${encoded}`,
    )
  })
})
