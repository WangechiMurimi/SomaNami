import { getAccessToken } from '../../lib/auth/access-token.ts'
import {
  FINAL_URL_HEADER,
  type FetchLinkErrorCode,
} from '../../types/contracts.ts'
import { UploadError } from './upload-error.ts'

const ENDPOINT = '/api/fetch-link'

/** Mirrors the server's cap so the message can name it; the server enforces it. */
export const LINK_MAX_MEGABYTES = 5

const PASTE_INSTEAD = 'Copy the text and use Paste text instead.'
const UPLOAD_INSTEAD = 'Download the file and upload it instead.'
const SERVER_UNREACHABLE =
  'We couldn’t reach the SomaNami server. Try again in a moment.'

/**
 * What the learner sees for each failure, and whether retrying the same link
 * can help. `validation` failures are about the link itself.
 */
const FAILURES: Record<
  FetchLinkErrorCode,
  { message: string; stage: 'validation' | 'processing'; retryable: boolean }
> = {
  'invalid-url': {
    message: 'That doesn’t look like a web address. Check it and try again.',
    stage: 'validation',
    retryable: false,
  },
  'video-not-supported': {
    message:
      'Video links aren’t supported yet. Add a link to an article or a document.',
    stage: 'validation',
    retryable: false,
  },
  'blocked-address': {
    message:
      'We can only fetch public web pages, not private or local addresses.',
    stage: 'validation',
    retryable: false,
  },
  'unsupported-type': {
    message:
      'That link isn’t something we can read. Links to PDFs, Word documents and web articles work.',
    stage: 'validation',
    retryable: false,
  },
  'too-large': {
    message: `That file is over ${LINK_MAX_MEGABYTES} MB, too large to add by link. ${UPLOAD_INSTEAD}`,
    stage: 'validation',
    retryable: false,
  },
  unreachable: {
    message: `We couldn’t reach that page. Check the link, or ${UPLOAD_INSTEAD.toLowerCase()}`,
    stage: 'processing',
    retryable: true,
  },
  timeout: {
    message: `That page took too long to respond. Try again, or ${UPLOAD_INSTEAD.toLowerCase()}`,
    stage: 'processing',
    retryable: true,
  },
  'too-many-redirects': {
    message:
      'That link redirects too many times. Open it in your browser and copy the address it ends up at.',
    stage: 'processing',
    retryable: false,
  },
  'login-or-paywall': {
    message: `That page needs a sign-in or subscription. ${PASTE_INSTEAD}`,
    stage: 'processing',
    retryable: false,
  },
  'rate-limited': {
    message: 'You’re adding links quickly. Wait a moment and try again.',
    stage: 'processing',
    retryable: true,
  },
  unauthorized: {
    message: 'Your session ended. Sign in again to add links.',
    stage: 'processing',
    retryable: false,
  },
  'not-configured': {
    message: 'Adding links isn’t available right now. Try again later.',
    stage: 'processing',
    retryable: true,
  },
}

const failure = (code: FetchLinkErrorCode, cause?: unknown) => {
  const { message, stage, retryable } = FAILURES[code]
  return new UploadError(code, message, { stage, retryable, cause })
}

const isErrorCode = (value: unknown): value is FetchLinkErrorCode =>
  typeof value === 'string' && Object.hasOwn(FAILURES, value)

/**
 * Turns what a learner typed into an http(s) URL, or `null` if it can't be one.
 * People often paste `example.org/page` without a scheme, so assume https.
 */
export function normalizeLink(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed || /\s/.test(trimmed)) return null
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  // A bare word like "notes" parses as a host; real hosts have a dot (or are IPv6).
  if (!url.hostname.includes('.') && !url.hostname.startsWith('[')) return null
  return url.href
}

/** The file name from `Content-Disposition`, preferring the UTF-8 `filename*` form. */
function nameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const extended = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)
  if (extended?.[1]) {
    try {
      return decodeURIComponent(extended[1].trim())
    } catch {
      // Fall through to the plain form if the encoding is broken.
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header)
  return plain?.[1]?.trim() || null
}

/** A readable name for the material when the server suggests none. */
function nameFromUrl(href: string): string {
  const url = new URL(href)
  const last = url.pathname.split('/').filter(Boolean).pop()
  if (last) {
    try {
      return decodeURIComponent(last)
    } catch {
      return last
    }
  }
  return url.hostname
}

/** Sends one fetch-link request; the token goes only in the header. */
async function post(url: string, token: string): Promise<Response> {
  try {
    return await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url }),
    })
  } catch (cause) {
    throw new UploadError(
      'offline',
      'We couldn’t reach SomaNami. Check your connection and try again.',
      { retryable: true, cause },
    )
  }
}

async function failureFrom(response: Response): Promise<UploadError> {
  let code: unknown
  let fromOurApi = false
  try {
    code = ((await response.json()) as { error?: unknown }).error
    fromOurApi = true
  } catch {
    // A proxy or crash page instead of our JSON; fall back to the status.
  }
  if (isErrorCode(code)) return failure(code)
  if (response.status === 429) return failure('rate-limited')
  // No JSON from us at all: a gateway answered because our API is down or
  // unreachable (in development, the Vite proxy's 502 when the server isn't
  // running). Saying "not available" here sent people looking in the wrong place.
  if (!fromOurApi && response.status >= 500) {
    return new UploadError('server-unreachable', SERVER_UNREACHABLE, {
      retryable: true,
    })
  }
  return failure('not-configured')
}

export interface FetchedLink {
  file: File
  finalUrl: string
}

/**
 * Fetches a link through `POST /api/fetch-link` (the browser can't reach other
 * sites directly) and returns it as a `File` for `parseDocument`. Throws
 * `UploadError`.
 */
export async function fetchLink(url: string): Promise<FetchedLink> {
  const token = await getAccessToken()
  if (!token) throw failure('unauthorized')

  let response = await post(url, token)
  if (response.status === 401) {
    // Tokens are short-lived; refresh once, as the chat client does.
    const fresh = await getAccessToken({ refresh: true })
    if (fresh) response = await post(url, fresh)
    if (!fresh || response.status === 401) throw failure('unauthorized')
  }
  if (!response.ok) throw await failureFrom(response)

  // Stored and later parsed for display, so only keep a well-formed http(s) URL.
  const finalUrl =
    normalizeLink(response.headers.get(FINAL_URL_HEADER) ?? '') ?? url
  const name =
    nameFromDisposition(response.headers.get('Content-Disposition')) ??
    nameFromUrl(finalUrl)
  const type = response.headers.get('Content-Type') ?? ''
  const bytes = await response.arrayBuffer()
  return { file: new File([bytes], name, { type }), finalUrl }
}
