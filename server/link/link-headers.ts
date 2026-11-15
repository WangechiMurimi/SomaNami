import { FINAL_URL_HEADER } from '../../src/types/contracts.ts'
import type { FetchedLink } from './fetch-link.ts'

/**
 * Headers for a successful `POST /api/fetch-link`, shared by both transports.
 * `API_HEADERS` (no-store, nosniff) are added separately, as on every route.
 */
export function linkResponseHeaders(
  link: Omit<FetchedLink, 'bytes'>,
): Record<string, string> {
  return {
    'Content-Type': link.contentType,
    [FINAL_URL_HEADER]: link.finalUrl,
    // `attachment` stops a browser that navigates here from rendering
    // fetched HTML on our origin; the RFC 8187 form carries any Unicode name.
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeRfc8187(link.fileName)}`,
  }
}

/** Percent-encodes everything outside RFC 8187's `attr-char` set. */
function encodeRfc8187(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}
