// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { LINK_MAX_URL_CHARS } from './limits.ts'
import { validateUrl } from './validate-url.ts'

const codeOf = (raw: string) => {
  const result = validateUrl(raw)
  return result.ok ? 'ok' : result.code
}

describe('validateUrl', () => {
  it.each([
    'https://example.com/paper.pdf',
    'http://example.com/',
    'https://en.wikipedia.org/wiki/Mitochondrion',
    'https://example.com:443/a',
    'http://example.com:80/a',
    'https://example.com./trailing-dot',
    'https://93.184.216.34/file.pdf',
    'https://[2606:4700:4700::1111]/',
  ])('accepts %s', (raw) => {
    expect(codeOf(raw)).toBe('ok')
  })

  it('returns the parsed URL', () => {
    const result = validateUrl('https://Example.COM:443/a b')

    expect(result).toEqual({
      ok: true,
      url: new URL('https://example.com/a%20b'),
    })
  })

  it.each([
    ['', 'empty'],
    ['not a url', 'unparseable'],
    ['/relative/path', 'relative'],
    ['ftp://example.com/file.pdf', 'ftp'],
    ['file:///etc/passwd', 'file'],
    ['javascript:alert(1)', 'javascript'],
    ['data:text/html,hi', 'data'],
    ['gopher://example.com/', 'gopher'],
    ['https://user:pass@example.com/', 'credentials'],
    ['https://user@example.com/', 'username only'],
    ['https://example.com:8080/', 'custom port'],
    ['http://example.com:443/', 'https port on http'],
    ['https://example.com:22/', 'ssh port'],
  ])('refuses %j as invalid (%s)', (raw) => {
    expect(codeOf(raw)).toBe('invalid-url')
  })

  it('refuses URLs over the length cap', () => {
    const long = `https://example.com/${'a'.repeat(LINK_MAX_URL_CHARS)}`

    expect(codeOf(long)).toBe('invalid-url')
  })

  it.each([
    'https://www.youtube.com/watch?v=abc',
    'https://youtube.com/watch?v=abc',
    'https://m.youtube.com/watch?v=abc',
    'https://music.youtube.com/watch?v=abc',
    'https://youtu.be/abc',
    'https://www.youtube-nocookie.com/embed/abc',
    'https://vimeo.com/12345',
    'https://player.vimeo.com/video/12345',
    'https://YOUTUBE.com./watch?v=abc',
  ])('refuses video host %s', (raw) => {
    expect(codeOf(raw)).toBe('video-not-supported')
  })

  it.each(['https://notyoutube.com/', 'https://youtube.com.evil.example/'])(
    'does not mistake %s for a video host',
    (raw) => {
      expect(codeOf(raw)).toBe('ok')
    },
  )

  it.each([
    ['http://127.0.0.1/', 'loopback'],
    ['http://127.1/', 'short form'],
    ['http://0x7f000001/', 'hex'],
    ['http://0x7f.0.0.1/', 'hex octet'],
    ['http://2130706433/', 'decimal'],
    ['http://017700000001/', 'octal'],
    ['http://0177.0.0.1/', 'octal octet'],
    ['http://0/', 'zero'],
    ['http://0.0.0.0/', 'unspecified'],
    ['http://169.254.169.254/latest/meta-data/', 'metadata'],
    ['http://10.0.0.1/', 'private'],
    ['http://192.168.0.1/', 'private'],
    ['http://[::1]/', 'IPv6 loopback'],
    ['http://[::]/', 'IPv6 unspecified'],
    ['http://[::ffff:127.0.0.1]/', 'IPv4-mapped'],
    ['http://[::ffff:7f00:1]/', 'IPv4-mapped hex'],
    ['http://[::ffff:169.254.169.254]/', 'IPv4-mapped metadata'],
    ['http://[fe80::1]/', 'IPv6 link-local'],
    ['http://[fd00::1]/', 'IPv6 unique local'],
    ['http://localhost/', 'localhost'],
    ['http://LOCALHOST./', 'localhost with dot'],
    ['http://app.localhost/', 'localhost subdomain'],
    ['http://intranet/', 'single label'],
  ])('refuses %s as a blocked address (%s)', (raw) => {
    expect(codeOf(raw)).toBe('blocked-address')
  })

  it('lets callers widen the address check (used by tests)', () => {
    expect(validateUrl('http://127.0.0.1/', () => true).ok).toBe(true)
  })
})
