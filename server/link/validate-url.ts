import { isIP } from 'node:net'
import type { FetchLinkErrorCode } from '../../src/types/contracts.ts'
import { LINK_MAX_URL_CHARS } from './limits.ts'
import { isPublicAddress } from './safe-address.ts'

export type ValidatedUrl =
  | { ok: true; url: URL }
  | {
      ok: false
      code: Extract<
        FetchLinkErrorCode,
        'invalid-url' | 'video-not-supported' | 'blocked-address'
      >
    }

// Video pages return a player, not readable material; captions are #58/#61.
const VIDEO_DOMAINS = ['youtube.com', 'youtube-nocookie.com', 'vimeo.com']
const VIDEO_HOSTS = ['youtu.be']

/**
 * Checks a link before any network traffic: scheme, credentials, port, length,
 * video hosts and IP literals. Hostnames still need the resolved-address check
 * in `fetch-link.ts`, since only DNS can say where a name points.
 */
export function validateUrl(
  raw: string,
  isAllowedAddress: (ip: string) => boolean = isPublicAddress,
): ValidatedUrl {
  if (raw.length > LINK_MAX_URL_CHARS) return { ok: false, code: 'invalid-url' }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, code: 'invalid-url' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, code: 'invalid-url' }
  }
  // Credentials in a link would be sent upstream on the learner's behalf.
  if (url.username || url.password) return { ok: false, code: 'invalid-url' }
  // The parser drops an explicit default port, so any port left is a custom
  // one: refusing it keeps the fetcher off internal admin and database ports.
  if (url.port) return { ok: false, code: 'invalid-url' }

  const host = url.hostname.replace(/\.$/, '')
  if (!host) return { ok: false, code: 'invalid-url' }

  if (
    VIDEO_HOSTS.includes(host) ||
    VIDEO_DOMAINS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    )
  ) {
    return { ok: false, code: 'video-not-supported' }
  }

  // The WHATWG parser has already rewritten every IPv4 spelling (`127.1`,
  // `0x7f000001`, `2130706433`, octal) to dotted decimal and wrapped IPv6 in
  // brackets, so one check covers all the obfuscated forms.
  const literal = host.startsWith('[') ? host.slice(1, -1) : host
  if (isIP(literal)) {
    return isAllowedAddress(literal)
      ? { ok: true, url }
      : { ok: false, code: 'blocked-address' }
  }

  // A name without a dot can only be resolved locally (`localhost`, an
  // intranet host or a search-domain match), never a public site.
  if (!host.includes('.') || host.endsWith('.localhost')) {
    return { ok: false, code: 'blocked-address' }
  }

  return { ok: true, url }
}
