import { testVideo, VIDEO_ID_PATTERN } from './fetch-captions.ts'
import type { FetchOptions } from './fetch-captions.ts'

/** Enough for the test list; more would risk the function's time limit. */
export const MAX_IDS = 10

/** Where the function ran, so a results table can say which host it describes. */
export const hostInfo = () => ({
  region: process.env.AWS_REGION ?? process.env.NETLIFY_REGION ?? 'local',
  runtime: `node ${process.version}`,
})

const json = (body: unknown, status = 200) => Response.json(body, { status })

/**
 * Serves the same routes as the Python spike (`/captions/:id` and
 * `/run?ids=`), so `run_batch.py --base-url` works against either host.
 */
export async function handleRequest(
  request: Request,
  options: FetchOptions = {},
): Promise<Response> {
  if (request.method !== 'GET') {
    return json({ error: 'method-not-allowed' }, 405)
  }
  const url = new URL(request.url)

  const single = /^\/captions\/([^/]+)\/?$/.exec(url.pathname)?.[1]
  if (single !== undefined) {
    if (!VIDEO_ID_PATTERN.test(single))
      return json({ error: 'invalid-id' }, 400)
    return json({ host: hostInfo(), ...(await testVideo(single, options)) })
  }

  if (url.pathname.replace(/\/$/, '') === '/run') {
    const ids = (url.searchParams.get('ids') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    if (ids.length === 0) return json({ error: 'missing-ids' }, 400)
    if (ids.length > MAX_IDS)
      return json({ error: 'too-many-ids', max: MAX_IDS }, 400)
    const invalid = ids.filter((id) => !VIDEO_ID_PATTERN.test(id))
    if (invalid.length > 0) return json({ error: 'invalid-id', invalid }, 400)

    // Parallel so the batch fits in one invocation; the Python spike ran them in
    // sequence, so compare per-video results, not total time.
    const results = await Promise.all(ids.map((id) => testVideo(id, options)))
    return json({
      host: hostInfo(),
      passed: results.filter((result) => result.ok).length,
      blocked: results.filter((result) => !result.ok && result.blocked).length,
      total: results.length,
      results,
    })
  }

  return json({ error: 'not-found' }, 404)
}
