// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createUserClient } from '../supabase/user-client.ts'
import {
  ChunkStoreError,
  createChunkStore,
  createChunkStoreFromEnv,
} from './chunk-store.ts'

const CONFIG = {
  url: 'https://project.supabase.test',
  publishableKey: 'sb_publishable_x',
}

/** Which user each test token belongs to, as Supabase would decode it. */
const TOKENS: Record<string, string> = {
  'token-1': 'user-1',
  'token-2': 'user-2',
}

type Row = {
  user_id: string
  id: string
  document_id: string
  position: number
  text: string
  embedding: number[] | null
}

const row = (
  userId: string,
  documentId: string,
  position: number,
  embedding: number[] | null = null,
): Row => ({
  user_id: userId,
  id: `${documentId}:${position}`,
  document_id: documentId,
  position,
  text: `${documentId} part ${position}`,
  embedding,
})

/**
 * A stand-in for PostgREST's `chunks` endpoint: reads and updates apply the
 * query's filters and RLS from the bearer token, as the real database would.
 */
function fakePostgrest(rows: Row[]) {
  const requests: { method: string; url: URL; headers: Headers }[] = []
  const fetch = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method ?? 'GET'
      const headers = new Headers(init?.headers)
      requests.push({ method, url, headers })
      const token = headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
      const caller = TOKENS[token]

      let matched = rows.filter((r) => r.user_id === caller)
      for (const [key, value] of url.searchParams) {
        const column = key as keyof Row
        if (value.startsWith('eq.')) {
          matched = matched.filter((r) => String(r[column]) === value.slice(3))
        } else if (value === 'is.null') {
          matched = matched.filter((r) => r[column] === null)
        }
      }

      if (method === 'PATCH') {
        const patch = JSON.parse(String(init?.body)) as Partial<Row>
        for (const r of matched) Object.assign(r, patch)
        return new Response(null, { status: 204 })
      }

      const order = url.searchParams.get('order')
      if (order) {
        const keys = order.split(',').map((part) => part.split('.')[0]!)
        matched = [...matched].sort((a, b) => {
          for (const key of keys as (keyof Row)[]) {
            const [x, y] = [a[key], b[key]] as [string, string]
            if (x < y) return -1
            if (x > y) return 1
          }
          return 0
        })
      }
      const limit = Number(url.searchParams.get('limit') ?? matched.length)
      const columns = (url.searchParams.get('select') ?? '*').split(',')
      return Response.json(
        matched
          .slice(0, limit)
          .map((r) =>
            Object.fromEntries(columns.map((c) => [c, r[c as keyof Row]])),
          ),
      )
    },
  )
  return { fetch, requests }
}

const storeWith = (fetch: typeof globalThis.fetch) =>
  createChunkStore({
    clientFor: (token) => createUserClient(CONFIG, token, { fetch }),
  })

const session = { userId: 'user-1', accessToken: 'token-1' }

describe('createChunkStore', () => {
  describe('pending', () => {
    it("lists the caller's chunks without an embedding, in reading order", async () => {
      const { fetch } = fakePostgrest([
        row('user-1', 'doc-b', 0),
        row('user-1', 'doc-a', 1),
        row('user-1', 'doc-a', 0),
        row('user-1', 'doc-a', 2, [0.1]),
        row('user-2', 'doc-z', 0),
      ])

      const pending = await storeWith(fetch)(session).pending(10)

      expect(pending).toEqual([
        { id: 'doc-a:0', text: 'doc-a part 0' },
        { id: 'doc-a:1', text: 'doc-a part 1' },
        { id: 'doc-b:0', text: 'doc-b part 0' },
      ])
    })

    it('reads at most the limit', async () => {
      const { fetch } = fakePostgrest([
        row('user-1', 'doc-a', 0),
        row('user-1', 'doc-a', 1),
        row('user-1', 'doc-a', 2),
      ])

      expect(await storeWith(fetch)(session).pending(2)).toHaveLength(2)
    })

    it('queries as the user: their token, the publishable key, and their id', async () => {
      const { fetch, requests } = fakePostgrest([row('user-1', 'doc-a', 0)])

      await storeWith(fetch)(session).pending(5)

      const [request] = requests
      expect(request!.headers.get('authorization')).toBe('Bearer token-1')
      expect(request!.headers.get('apikey')).toBe('sb_publishable_x')
      expect(request!.url.searchParams.get('user_id')).toBe('eq.user-1')
      expect(request!.url.searchParams.get('embedding')).toBe('is.null')
      // The vector column is never read back.
      expect(request!.url.searchParams.get('select')).toBe('id,text')
    })

    it('skips malformed rows', async () => {
      const broken = { ...row('user-1', 'doc-a', 0), text: 42 }
      const { fetch } = fakePostgrest([
        broken as unknown as Row,
        row('user-1', 'doc-a', 1),
      ])

      expect(await storeWith(fetch)(session).pending(5)).toEqual([
        { id: 'doc-a:1', text: 'doc-a part 1' },
      ])
    })

    it('throws ChunkStoreError when the database fails', async () => {
      const fetch = vi.fn(async () =>
        Response.json(
          { code: '57014', message: 'canceling statement' },
          { status: 500 },
        ),
      )

      await expect(storeWith(fetch)(session).pending(5)).rejects.toBeInstanceOf(
        ChunkStoreError,
      )
    })
  })

  describe('save', () => {
    it('writes each vector to its own chunk, as the user', async () => {
      const rows = [
        row('user-1', 'doc-a', 0),
        row('user-1', 'doc-a', 1),
        row('user-2', 'doc-a', 0),
      ]
      const { fetch, requests } = fakePostgrest(rows)

      await storeWith(fetch)(session).save([
        { id: 'doc-a:0', embedding: [1, 2] },
        { id: 'doc-a:1', embedding: [3, 4] },
      ])

      expect(rows.map((r) => r.embedding)).toEqual([[1, 2], [3, 4], null])
      for (const { method, url, headers } of requests) {
        expect(method).toBe('PATCH')
        expect(headers.get('authorization')).toBe('Bearer token-1')
        expect(url.searchParams.get('user_id')).toBe('eq.user-1')
      }
    })

    it('sends only the embedding, never the chunk text', async () => {
      const { fetch } = fakePostgrest([row('user-1', 'doc-a', 0)])

      await storeWith(fetch)(session).save([
        { id: 'doc-a:0', embedding: [1, 2] },
      ])

      const body = JSON.parse(String(fetch.mock.calls[0]![1]?.body)) as object
      expect(Object.keys(body)).toEqual(['embedding'])
    })

    it('makes no request for nothing', async () => {
      const { fetch } = fakePostgrest([])

      await storeWith(fetch)(session).save([])

      expect(fetch).not.toHaveBeenCalled()
    })

    it('throws ChunkStoreError when a write fails', async () => {
      const fetch = vi.fn(async () =>
        Response.json({ code: '42501', message: 'denied' }, { status: 403 }),
      )

      await expect(
        storeWith(fetch)(session).save([{ id: 'doc-a:0', embedding: [1] }]),
      ).rejects.toBeInstanceOf(ChunkStoreError)
    })
  })
})

describe('createChunkStoreFromEnv', () => {
  it('returns null without Supabase settings', () => {
    expect(createChunkStoreFromEnv({})).toBeNull()
  })

  it('builds a store from the public settings', () => {
    expect(
      createChunkStoreFromEnv({
        SUPABASE_URL: CONFIG.url,
        SUPABASE_PUBLISHABLE_KEY: CONFIG.publishableKey,
      }),
    ).toBeTypeOf('function')
  })
})
