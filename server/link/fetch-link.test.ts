// @vitest-environment node
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { isIP, type AddressInfo } from 'node:net'
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  fetchLink,
  type FetchLinkOptions,
  type Resolve,
  type SendRequest,
} from './fetch-link.ts'

type Handler = (request: IncomingMessage, response: ServerResponse) => void

// Every test talks to this local server; no test touches the real network.
// Hostnames under `.test` resolve through the fake resolver below, and the
// request seam swaps in the server's port, since links must use default ports.
let server: Server
let port: number
let handler: Handler
let seen: IncomingMessage[]

beforeAll(async () => {
  server = createServer((request, response) => {
    seen.push(request)
    handler(request, response)
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((done) => server.close(done))
})

beforeEach(() => {
  seen = []
  resolve.mockClear()
  handler = (_request, response) => response.end()
})

const serve = (next: Handler) => {
  handler = next
}

const DNS: Record<string, string[]> = {
  'docs.test': ['127.0.0.1'],
  'mirror.test': ['127.0.0.1'],
  'internal.test': ['10.0.0.8'],
  'mixed.test': ['127.0.0.1', '192.168.1.20'],
  'empty.test': [],
}

const resolve = vi.fn<Resolve>(async (hostname) => {
  const addresses = DNS[hostname]
  if (!addresses) throw Object.assign(new Error('nope'), { code: 'ENOTFOUND' })
  return addresses.map((address) => ({ address, family: isIP(address) }))
})

const toLocalServer: SendRequest = (options, onResponse) =>
  httpRequest({ ...options, port }, onResponse)

/** The local server stands in for a public host, so only its address is allowed. */
const options = (overrides: FetchLinkOptions = {}): FetchLinkOptions => ({
  resolve,
  isAllowedAddress: (ip) => ip === '127.0.0.1',
  sendRequest: toLocalServer,
  ...overrides,
})

const send =
  (status: number, headers: Record<string, string | number>, body = '') =>
  (_request: IncomingMessage, response: ServerResponse) => {
    response.writeHead(status, headers)
    response.end(body)
  }

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

/** The Host header without the test server's port, which real links never carry. */
const hostOf = (request: IncomingMessage | undefined) =>
  request?.headers.host?.split(':')[0]

describe('fetchLink', () => {
  describe('success', () => {
    it('returns the body, type, final URL and a file name', async () => {
      serve(
        send(
          200,
          { 'Content-Type': 'text/html; charset=ISO-8859-1' },
          '<p>Hi</p>',
        ),
      )

      const result = await fetchLink('http://docs.test/notes/cells', options())

      expect(result).toEqual({
        ok: true,
        link: {
          bytes: new TextEncoder().encode('<p>Hi</p>'),
          contentType: 'text/html; charset=ISO-8859-1',
          finalUrl: 'http://docs.test/notes/cells',
          fileName: 'cells.html',
        },
      })
    })

    it('sends a generic identity, the allowed types and the original Host', async () => {
      serve(send(200, { 'Content-Type': 'text/plain' }, 'ok'))

      await fetchLink('http://docs.test/a?b=c', options())

      const [request] = seen
      expect(request?.url).toBe('/a?b=c')
      expect(hostOf(request)).toBe('docs.test')
      expect(request?.headers['user-agent']).toBe('SomaNami-LinkFetcher/1.0')
      expect(request?.headers.accept).toContain('application/pdf')
      expect(request?.headers.accept).toContain('text/html')
      expect(request?.headers['accept-encoding']).toBe('gzip, deflate, br')
      expect(request?.headers.cookie).toBeUndefined()
      expect(request?.headers.authorization).toBeUndefined()
    })

    it('treats a missing Content-Type as a download for the browser to sniff', async () => {
      serve((_request, response) => {
        response.removeHeader('Content-Type')
        response.end('%PDF-1.7')
      })

      const result = await fetchLink('http://docs.test/paper.pdf', options())

      expect(result).toMatchObject({
        ok: true,
        link: {
          contentType: 'application/octet-stream',
          fileName: 'paper.pdf',
        },
      })
    })

    it('prefers the upstream Content-Disposition name', async () => {
      serve(
        send(
          200,
          {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="Lecture 3.pdf"',
          },
          '%PDF',
        ),
      )

      const result = await fetchLink(
        'http://docs.test/download?id=9',
        options(),
      )

      expect(result).toMatchObject({
        ok: true,
        link: { fileName: 'Lecture 3.pdf' },
      })
    })

    it('connects with a single address lookup too', async () => {
      serve(send(200, { 'Content-Type': 'text/plain' }, 'ok'))

      const result = await fetchLink(
        'http://docs.test/',
        options({
          sendRequest: (requestOptions, onResponse) =>
            httpRequest({ ...requestOptions, port, family: 4 }, onResponse),
        }),
      )

      expect(result.ok).toBe(true)
    })

    it.each([
      ['gzip', gzipSync],
      ['x-gzip', gzipSync],
      ['deflate', deflateSync],
      ['br', brotliCompressSync],
    ])('decompresses %s bodies', async (encoding, compress) => {
      serve((_request, response) => {
        response.writeHead(200, {
          'Content-Type': 'text/plain',
          'Content-Encoding': encoding,
        })
        response.end(compress(Buffer.from('compressed notes')))
      })

      const result = await fetchLink('http://docs.test/n.txt', options())

      expect(result.ok && text(result.link.bytes)).toBe('compressed notes')
    })
  })

  describe('content type', () => {
    it.each([
      'application/pdf',
      'text/html',
      'application/xhtml+xml',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain; charset=utf-8',
      'text/markdown',
      'application/octet-stream',
      'TEXT/HTML; Charset=UTF-8',
    ])('accepts %s', async (type) => {
      serve(send(200, { 'Content-Type': type }, 'x'))

      const result = await fetchLink('http://docs.test/f', options())

      expect(result).toMatchObject({ ok: true, link: { contentType: type } })
    })

    it.each(['image/png', 'application/zip', 'video/mp4', 'application/json'])(
      'refuses %s',
      async (type) => {
        serve(send(200, { 'Content-Type': type }, 'x'))

        const result = await fetchLink('http://docs.test/f', options())

        expect(result).toEqual({ ok: false, code: 'unsupported-type' })
      },
    )

    it('refuses an encoding it cannot decode', async () => {
      serve(
        send(
          200,
          { 'Content-Type': 'text/plain', 'Content-Encoding': 'zstd' },
          'x',
        ),
      )

      const result = await fetchLink('http://docs.test/f', options())

      expect(result).toEqual({ ok: false, code: 'unsupported-type' })
    })

    it('reports a corrupt compressed body as unreachable', async () => {
      serve(
        send(
          200,
          { 'Content-Type': 'text/plain', 'Content-Encoding': 'gzip' },
          'not gzip',
        ),
      )

      const result = await fetchLink('http://docs.test/f', options())

      expect(result).toEqual({ ok: false, code: 'unreachable' })
    })
  })

  describe('size cap', () => {
    it('refuses a declared Content-Length over the cap before reading', async () => {
      serve(send(200, { 'Content-Type': 'text/plain' }, 'x'.repeat(101)))

      const result = await fetchLink(
        'http://docs.test/f',
        options({ maxBytes: 100 }),
      )

      expect(result).toEqual({ ok: false, code: 'too-large' })
    })

    it('stops a streamed body as soon as it passes the cap', async () => {
      let written = 0
      serve((_request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/plain' })
        // Chunked, with no length to check up front, and far past the cap.
        const pump = () => {
          while (written < 10_000_000) {
            written += 1024
            if (!response.write('x'.repeat(1024))) {
              response.once('drain', pump)
              return
            }
          }
          response.end()
        }
        response.on('error', () => {})
        pump()
      })

      const result = await fetchLink(
        'http://docs.test/f',
        options({ maxBytes: 4096 }),
      )

      expect(result).toEqual({ ok: false, code: 'too-large' })
      expect(written).toBeLessThan(10_000_000)
    })

    it('counts decompressed bytes, so a gzip bomb is refused', async () => {
      const bomb = gzipSync(Buffer.alloc(2_000_000))
      expect(bomb.byteLength).toBeLessThan(10_000)
      serve((_request, response) => {
        response.writeHead(200, {
          'Content-Type': 'text/plain',
          'Content-Encoding': 'gzip',
        })
        response.end(bomb)
      })

      const result = await fetchLink(
        'http://docs.test/f',
        options({ maxBytes: 100_000 }),
      )

      expect(result).toEqual({ ok: false, code: 'too-large' })
    })

    it('accepts a body exactly at the cap', async () => {
      serve(send(200, { 'Content-Type': 'text/plain' }, 'x'.repeat(100)))

      const result = await fetchLink(
        'http://docs.test/f',
        options({ maxBytes: 100 }),
      )

      expect(result.ok && result.link.bytes.byteLength).toBe(100)
    })
  })

  describe('redirects', () => {
    it('follows a relative Location and reports the final URL', async () => {
      serve((request, response) => {
        if (request.url === '/old') {
          response.writeHead(301, { Location: '/new/paper.pdf' })
          response.end()
          return
        }
        send(
          200,
          { 'Content-Type': 'application/pdf' },
          '%PDF',
        )(request, response)
      })

      const result = await fetchLink('http://docs.test/old', options())

      expect(result).toMatchObject({
        ok: true,
        link: {
          finalUrl: 'http://docs.test/new/paper.pdf',
          fileName: 'paper.pdf',
        },
      })
    })

    it('follows a redirect to another host with its own Host header', async () => {
      serve((request, response) => {
        if (hostOf(request) === 'docs.test') {
          response.writeHead(302, { Location: 'http://mirror.test/copy.txt' })
          response.end()
          return
        }
        send(200, { 'Content-Type': 'text/plain' }, 'mirror')(request, response)
      })

      const result = await fetchLink('http://docs.test/f', options())

      expect(result.ok && text(result.link.bytes)).toBe('mirror')
      expect(seen.map(hostOf)).toEqual(['docs.test', 'mirror.test'])
    })

    it.each([303, 307, 308])('follows a %i redirect', async (status) => {
      serve((request, response) => {
        if (request.url === '/a') {
          response.writeHead(status, { Location: '/b' })
          response.end()
          return
        }
        send(200, { 'Content-Type': 'text/plain' }, 'b')(request, response)
      })

      const result = await fetchLink('http://docs.test/a', options())

      expect(result.ok).toBe(true)
    })

    it('gives up after the redirect limit', async () => {
      serve((request, response) => {
        const n = Number(request.url?.slice(1)) || 0
        response.writeHead(302, { Location: `/${n + 1}` })
        response.end()
      })

      const result = await fetchLink(
        'http://docs.test/0',
        options({ maxRedirects: 3 }),
      )

      expect(result).toEqual({ ok: false, code: 'too-many-redirects' })
      // The original request plus three followed hops.
      expect(seen).toHaveLength(4)
    })

    it.each([
      ['http://169.254.169.254/latest/meta-data/', 'blocked-address'],
      ['http://10.1/', 'blocked-address'],
      ['http://[::ffff:10.0.0.1]/', 'blocked-address'],
      ['http://localhost/admin', 'blocked-address'],
      ['http://internal.test/', 'blocked-address'],
      ['http://mixed.test/', 'blocked-address'],
      ['https://www.youtube.com/watch?v=x', 'video-not-supported'],
      ['ftp://docs.test/file', 'unreachable'],
      ['http://docs.test:8080/', 'unreachable'],
      ['http://user:pw@docs.test/', 'unreachable'],
    ])(
      're-validates each hop: a redirect to %s is %s',
      async (target, code) => {
        serve((_request, response) => {
          response.writeHead(302, { Location: target })
          response.end()
        })

        const result = await fetchLink('http://docs.test/start', options())

        expect(result).toEqual({ ok: false, code })
        expect(seen).toHaveLength(1)
      },
    )

    it('treats a redirect without a Location as unreachable', async () => {
      serve(send(302, {}))

      const result = await fetchLink('http://docs.test/f', options())

      expect(result).toEqual({ ok: false, code: 'unreachable' })
    })
  })

  describe('status codes', () => {
    it.each([401, 403, 407, 451])(
      'maps %i to login-or-paywall',
      async (status) => {
        serve(send(status, { 'Content-Type': 'text/html' }, 'Sign in'))

        const result = await fetchLink('http://docs.test/f', options())

        expect(result).toEqual({ ok: false, code: 'login-or-paywall' })
      },
    )

    it.each([404, 410, 418, 500, 503, 304])(
      'maps %i to unreachable',
      async (status) => {
        serve(send(status, {}))

        const result = await fetchLink('http://docs.test/f', options())

        expect(result).toEqual({ ok: false, code: 'unreachable' })
      },
    )
  })

  describe('address checks', () => {
    it('refuses a host that resolves to a private address, without connecting', async () => {
      const result = await fetchLink('http://internal.test/', options())

      expect(result).toEqual({ ok: false, code: 'blocked-address' })
      expect(seen).toHaveLength(0)
    })

    it('refuses a host if any of its addresses is private', async () => {
      const result = await fetchLink('http://mixed.test/', options())

      expect(result).toEqual({ ok: false, code: 'blocked-address' })
      expect(seen).toHaveLength(0)
    })

    it('uses the public-address check by default', async () => {
      // docs.test resolves to 127.0.0.1, which only the test override allows.
      const result = await fetchLink(
        'http://docs.test/',
        options({ isAllowedAddress: undefined }),
      )

      expect(result).toEqual({ ok: false, code: 'blocked-address' })
      expect(seen).toHaveLength(0)
    })

    it('refuses IP-literal links before any request', async () => {
      const send = vi.fn<SendRequest>()

      const result = await fetchLink(
        'http://0x7f000001/',
        options({ isAllowedAddress: undefined, sendRequest: send }),
      )

      expect(result).toEqual({ ok: false, code: 'blocked-address' })
      expect(send).not.toHaveBeenCalled()
    })

    it('resolves once per hop and connects to the address it checked', async () => {
      // A rebinding resolver answers a public address first and a private one
      // after. Pinning means the second answer is never asked for.
      let calls = 0
      const rebinding = vi.fn<Resolve>(async () => {
        calls++
        return [{ address: calls === 1 ? '127.0.0.1' : '10.0.0.1', family: 4 }]
      })
      serve(send(200, { 'Content-Type': 'text/plain' }, 'pinned'))

      const result = await fetchLink(
        'http://rebind.test/',
        options({ resolve: rebinding }),
      )

      expect(result.ok && text(result.link.bytes)).toBe('pinned')
      expect(rebinding).toHaveBeenCalledTimes(1)
      expect(rebinding).toHaveBeenCalledWith('rebind.test')
    })

    it.each(['nowhere.test', 'empty.test'])(
      'reports %s, which does not resolve, as unreachable',
      async (host) => {
        const result = await fetchLink(`http://${host}/`, options())

        expect(result).toEqual({ ok: false, code: 'unreachable' })
      },
    )

    it('reports a refused connection as unreachable', async () => {
      const closed = createServer()
      await new Promise<void>((done) => closed.listen(0, '127.0.0.1', done))
      const closedPort = (closed.address() as AddressInfo).port
      await new Promise((done) => closed.close(done))

      const result = await fetchLink(
        'http://docs.test/',
        options({
          sendRequest: (requestOptions, onResponse) =>
            httpRequest({ ...requestOptions, port: closedPort }, onResponse),
        }),
      )

      expect(result).toEqual({ ok: false, code: 'unreachable' })
    })
  })

  describe('validation', () => {
    it.each([
      ['not a url', 'invalid-url'],
      ['https://youtu.be/abc', 'video-not-supported'],
      ['http://[::1]/', 'blocked-address'],
    ])('refuses %s as %s without a request', async (raw, code) => {
      const result = await fetchLink(raw, options())

      expect(result).toEqual({ ok: false, code })
      expect(resolve).not.toHaveBeenCalled()
      expect(seen).toHaveLength(0)
    })
  })

  describe('timeout', () => {
    it('gives up when the server never answers', async () => {
      serve(() => {})

      const result = await fetchLink(
        'http://docs.test/',
        options({ timeoutMs: 100 }),
      )

      expect(result).toEqual({ ok: false, code: 'timeout' })
    })

    it('gives up when the body stalls part-way', async () => {
      serve((_request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/plain' })
        response.write('partial')
      })

      const result = await fetchLink(
        'http://docs.test/',
        options({ timeoutMs: 100 }),
      )

      expect(result).toEqual({ ok: false, code: 'timeout' })
    })

    it('shares one budget across redirects', async () => {
      serve((request, response) => {
        // Each hop is slow but not individually over the budget.
        setTimeout(() => {
          response.writeHead(302, { Location: `${request.url}x` })
          response.end()
        }, 60)
      })

      const result = await fetchLink(
        'http://docs.test/',
        options({ timeoutMs: 150, maxRedirects: 10 }),
      )

      expect(result).toEqual({ ok: false, code: 'timeout' })
    })
  })
})
