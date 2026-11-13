/**
 * Headers every `/api/*` response carries. Netlify's `[[headers]]` don't reach
 * Function responses, so both transports set these themselves: replies are
 * session-bound and must never be cached or content-sniffed.
 */
export const API_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

/** Adds `API_HEADERS` to a Fetch API response (Netlify Functions). */
export function withApiHeaders(response: Response): Response {
  for (const [name, value] of Object.entries(API_HEADERS)) {
    response.headers.set(name, value)
  }
  return response
}
