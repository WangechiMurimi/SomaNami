import type { LookupAddress } from 'node:dns'
import { lookup as dnsLookup } from 'node:dns/promises'
import {
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
  type RequestOptions,
} from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { LookupFunction } from 'node:net'
import { pipeline, type Readable } from 'node:stream'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'
import type { FetchLinkErrorCode } from '../../src/types/contracts.ts'
import { linkFileName } from './file-name.ts'
import {
  LINK_MAX_BYTES,
  LINK_MAX_REDIRECTS,
  LINK_TIMEOUT_MS,
} from './limits.ts'
import { isPublicAddress } from './safe-address.ts'
import { validateUrl } from './validate-url.ts'

/** The fetched body, ready to hand to the browser's document parser. */
export interface FetchedLink {
  bytes: Uint8Array
  /** The upstream `Content-Type`, parameters such as `charset` included. */
  contentType: string
  /** Where the bytes came from after redirects. */
  finalUrl: string
  fileName: string
}

export type FetchLinkOutcome =
  { ok: true; link: FetchedLink } | { ok: false; code: FetchLinkErrorCode }

/** Resolves a hostname to every address it points at. */
export type Resolve = (hostname: string) => Promise<LookupAddress[]>

/** Starts one HTTP(S) request; the seam tests use to reach a local server. */
export type SendRequest = (
  options: RequestOptions,
  onResponse: (response: IncomingMessage) => void,
) => ClientRequest

export interface FetchLinkOptions {
  resolve?: Resolve
  /** Decides which resolved addresses may be contacted. */
  isAllowedAddress?: (ip: string) => boolean
  sendRequest?: SendRequest
  maxBytes?: number
  timeoutMs?: number
  maxRedirects?: number
}

/** Media types the browser can parse, or sniff when the server is vague. */
export const ALLOWED_MEDIA_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'text/html',
  'application/xhtml+xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'application/octet-stream',
])

const REQUEST_HEADERS = {
  // Generic on purpose: it names the product, never the learner.
  'User-Agent': 'SomaNami-LinkFetcher/1.0',
  // `*/*` last, so servers that 406 on an unknown Accept still answer and the
  // allow-list below makes the decision.
  Accept: [
    ...[...ALLOWED_MEDIA_TYPES].filter(
      (type) => type !== 'application/octet-stream',
    ),
    'application/octet-stream;q=0.5',
    '*/*;q=0.1',
  ].join(', '),
  'Accept-Encoding': 'gzip, deflate, br',
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const LOGIN_STATUSES = new Set([401, 403, 407, 451])

class LinkFetchError extends Error {
  readonly code: FetchLinkErrorCode

  constructor(code: FetchLinkErrorCode) {
    // The message is only the code: URLs and hosts are the learner's private
    // reading list and must not leak into logs through an error message.
    super(code)
    this.name = 'LinkFetchError'
    this.code = code
  }
}

const defaultResolve: Resolve = (hostname) => dnsLookup(hostname, { all: true })

const defaultSendRequest: SendRequest = (options, onResponse) =>
  options.protocol === 'https:'
    ? httpsRequest(options, onResponse)
    : httpRequest(options, onResponse)

/**
 * Fetches a learner-supplied link without letting it reach our own network:
 * every hop is validated, every resolved address must be public, and the
 * connection is pinned to the address that was checked, so a DNS answer that
 * changes between check and connect (rebinding) cannot redirect it.
 */
export async function fetchLink(
  raw: string,
  {
    resolve = defaultResolve,
    isAllowedAddress = isPublicAddress,
    sendRequest = defaultSendRequest,
    maxBytes = LINK_MAX_BYTES,
    timeoutMs = LINK_TIMEOUT_MS,
    maxRedirects = LINK_MAX_REDIRECTS,
  }: FetchLinkOptions = {},
): Promise<FetchLinkOutcome> {
  const checked = validateUrl(raw, isAllowedAddress)
  if (!checked.ok) return checked

  // One budget for the whole chain, so redirects cannot stretch it.
  const signal = AbortSignal.timeout(timeoutMs)
  const hop = { resolve, isAllowedAddress, sendRequest, signal }
  let url = checked.url

  try {
    for (let redirects = 0; ; redirects++) {
      const response = await get(url, hop)
      const status = response.statusCode ?? 0

      if (REDIRECT_STATUSES.has(status)) {
        response.destroy()
        const location = response.headers.location
        if (!location) throw new LinkFetchError('unreachable')
        if (redirects >= maxRedirects) {
          throw new LinkFetchError('too-many-redirects')
        }
        url = nextHop(url, location, isAllowedAddress)
        continue
      }

      if (status < 200 || status > 299) {
        response.destroy()
        throw new LinkFetchError(
          LOGIN_STATUSES.has(status) ? 'login-or-paywall' : 'unreachable',
        )
      }

      return { ok: true, link: await readBody(response, url, maxBytes) }
    }
  } catch (error) {
    if (error instanceof LinkFetchError) return { ok: false, code: error.code }
    if (signal.aborted) return { ok: false, code: 'timeout' }
    // DNS failures, refused connections, TLS errors and corrupt compression
    // all mean the same thing to the learner: we couldn't get the file.
    return { ok: false, code: 'unreachable' }
  }
}

interface HopDependencies {
  resolve: Resolve
  isAllowedAddress: (ip: string) => boolean
  sendRequest: SendRequest
  signal: AbortSignal
}

function get(url: URL, deps: HopDependencies): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    // Node may wrap or replace a lookup error on its way to the request's
    // 'error' event, so remember our own verdict to report it faithfully.
    let refused: LinkFetchError | undefined

    const lookup: LookupFunction = (hostname, options, callback) => {
      checkedAddresses(hostname, deps).then(
        (addresses) => {
          const [first] = addresses as [LookupAddress]
          if (options.all) callback(null, addresses)
          else callback(null, first.address, first.family)
        },
        (error: Error) => {
          if (error instanceof LinkFetchError) refused = error
          callback(error, '')
        },
      )
    }

    const request = deps.sendRequest(
      {
        protocol: url.protocol,
        // IPv6 literals are bracketed in URLs but not in socket options. Host
        // header and TLS SNI follow this name, not the pinned address.
        hostname: url.hostname.replace(/^\[|\]$/g, ''),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: REQUEST_HEADERS,
        lookup,
        signal: deps.signal,
        // A fresh socket per hop: a pooled one could outlive the check that
        // approved its address.
        agent: false,
      },
      resolve,
    )
    request.on('error', (error) => reject(refused ?? error))
    request.end()
  })
}

/** Resolves `hostname` and refuses it if any answer is not allowed. */
async function checkedAddresses(
  hostname: string,
  { resolve, isAllowedAddress }: HopDependencies,
): Promise<LookupAddress[]> {
  let addresses: LookupAddress[]
  try {
    addresses = await resolve(hostname)
  } catch {
    throw new LinkFetchError('unreachable')
  }
  if (addresses.length === 0) throw new LinkFetchError('unreachable')
  // Any private answer refuses the whole name: a host that mixes public and
  // private records is either misconfigured or probing us.
  if (!addresses.every(({ address }) => isAllowedAddress(address))) {
    throw new LinkFetchError('blocked-address')
  }
  return addresses
}

function nextHop(
  current: URL,
  location: string,
  isAllowedAddress: (ip: string) => boolean,
): URL {
  let next: URL
  try {
    next = new URL(location, current)
  } catch {
    throw new LinkFetchError('unreachable')
  }
  const checked = validateUrl(next.href, isAllowedAddress)
  if (checked.ok) return checked.url
  // The learner's link was fine; a redirect to a non-web scheme or a custom
  // port is the server's problem. Blocked and video targets keep their code.
  throw new LinkFetchError(
    checked.code === 'invalid-url' ? 'unreachable' : checked.code,
  )
}

async function readBody(
  response: IncomingMessage,
  url: URL,
  maxBytes: number,
): Promise<FetchedLink> {
  try {
    // A missing type is common for file downloads; the browser sniffs those.
    const contentType =
      response.headers['content-type']?.trim() || 'application/octet-stream'
    const mediaType = (contentType.split(';')[0] ?? '').trim().toLowerCase()
    if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
      throw new LinkFetchError('unsupported-type')
    }

    // A declared length is free to check. It counts compressed bytes, which
    // never exceed the decompressed size, so it can only refuse true misses.
    if (Number(response.headers['content-length']) > maxBytes) {
      throw new LinkFetchError('too-large')
    }

    const chunks: Buffer[] = []
    let received = 0
    // The cap counts decompressed bytes, so a small gzip bomb is stopped as
    // soon as it expands past the limit rather than after it fills memory.
    for await (const chunk of decoded(response) as AsyncIterable<Buffer>) {
      received += chunk.byteLength
      if (received > maxBytes) throw new LinkFetchError('too-large')
      chunks.push(chunk)
    }

    return {
      bytes: new Uint8Array(Buffer.concat(chunks)),
      contentType,
      finalUrl: url.href,
      fileName: linkFileName(
        response.headers['content-disposition'],
        url,
        mediaType,
      ),
    }
  } finally {
    // Stop the download on every early exit, not only the happy path.
    response.destroy()
  }
}

function decoded(response: IncomingMessage): Readable {
  const encoding = (response.headers['content-encoding'] ?? '')
    .trim()
    .toLowerCase()
  if (encoding === '' || encoding === 'identity') return response

  const decoder =
    encoding === 'gzip' || encoding === 'x-gzip'
      ? createGunzip()
      : encoding === 'deflate'
        ? createInflate()
        : encoding === 'br'
          ? createBrotliDecompress()
          : null
  // Stacked or exotic encodings are vanishingly rare from real file hosts.
  if (!decoder) throw new LinkFetchError('unsupported-type')
  // pipeline forwards upstream errors (aborts included) into the decoder,
  // which then rejects the iteration above. The callback is required by the
  // API; the iteration is where failures are handled.
  return pipeline(response, decoder, () => {})
}
