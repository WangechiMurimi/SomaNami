// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { handleRequest, MAX_IDS } from './handle-request.ts'

const ID_A = 'RYT08CaYq6A'
const ID_B = 'B3U1NDUiwSA'

// Every YouTube call fails fast, so these tests exercise routing, not fetching.
const offline = (async () => {
  throw new TypeError('offline')
}) as typeof fetch

const get = (path: string, method = 'GET') =>
  handleRequest(new Request(`http://localhost${path}`, { method }), {
    fetch: offline,
  })

describe('handleRequest', () => {
  it('runs a batch and summarises it the way run_batch.py expects', async () => {
    const response = await get(`/run?ids=${ID_A}, ${ID_B}`)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ passed: 0, blocked: 0, total: 2 })
    expect(body.results.map((r: { video_id: string }) => r.video_id)).toEqual([
      ID_A,
      ID_B,
    ])
    expect(body.results[0]).toMatchObject({ ok: false, error: 'NetworkError' })
    expect(body.host.region).toBeTypeOf('string')
  })

  it('tests one video at /captions/:id', async () => {
    const body = await (await get(`/captions/${ID_A}`)).json()

    expect(body).toMatchObject({ video_id: ID_A, ok: false })
  })

  it.each([
    ['/run', 'missing-ids'],
    ['/run?ids=not-an-id', 'invalid-id'],
    [
      `/run?ids=${Array(MAX_IDS + 1)
        .fill(ID_A)
        .join(',')}`,
      'too-many-ids',
    ],
    ['/captions/short', 'invalid-id'],
  ])('rejects %s with %s', async (path, error) => {
    const response = await get(path)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error })
  })

  it('answers unknown paths and methods with JSON errors', async () => {
    expect((await get('/elsewhere')).status).toBe(404)
    expect((await get(`/captions/${ID_A}`, 'POST')).status).toBe(405)
  })
})
