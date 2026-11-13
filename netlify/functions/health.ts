import { withApiHeaders } from '../../server/api-headers.ts'

/** Netlify Function serving `GET /api/health`, mirroring the Express route. */
export default function health(): Response {
  return withApiHeaders(Response.json({ status: 'ok' }))
}

export const config = { path: '/api/health' }
