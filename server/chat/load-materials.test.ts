// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createUserClient } from '../supabase/user-client.ts'
import {
  createMaterialsLoader,
  createMaterialsLoaderFromEnv,
  MaterialsUnavailableError,
} from './load-materials.ts'

const CONFIG = {
  url: 'https://project.supabase.test',
  publishableKey: 'sb_publishable_x',
}

/** Which user each test token belongs to, as Supabase would decode it. */
const TOKENS: Record<string, string> = {
  'token-1': 'user-1',
  'token-2': 'user-2',
}

type Row = Record<string, unknown> & { user_id: string }

const TABLES: Record<string, Row[]> = {
  documents: [
    { user_id: 'user-1', id: 'doc-1', name: 'Cells.pdf' },
    { user_id: 'user-1', id: 'doc-2', name: 'Plants.pdf' },
    { user_id: 'user-2', id: 'doc-9', name: 'Theirs.pdf' },
  ],
  chunks: [
    chunkRow('user-1', 'doc-1', 1, 'Mitochondria have DNA.'),
    chunkRow('user-1', 'doc-1', 0, 'Mitochondria make ATP.'),
    chunkRow('user-1', 'doc-2', 0, 'Leaves are green.'),
    chunkRow('user-2', 'doc-9', 0, 'Private notes.'),
  ],
}

function chunkRow(
  userId: string,
  documentId: string,
  position: number,
  text: string,
): Row {
  return {
    user_id: userId,
    id: `${documentId}:${position}`,
    document_id: documentId,
    position,
    text,
    source: { type: 'page', page: position + 1 },
  }
}

const listOf = (value: string) =>
  value
    .replace(/^in\.\(|\)$/g, '')
    .split(',')
    .map((item) => item.replace(/^"|"$/g, ''))

/**
 * A stand-in for PostgREST: applies the query's filters, ordering and range,
 * and RLS from the bearer token, as the real database would.
 */
function fakePostgrest(tables = TABLES) {
  const requests: { url: URL; headers: Headers }[] = []
  const fetch = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      const headers = new Headers(init?.headers)
      requests.push({ url, headers })
      const token = headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
      const caller = TOKENS[token]
      const table = url.pathname.replace('/rest/v1/', '')

      let rows = (tables[table] ?? []).filter((row) => row.user_id === caller)
      for (const [key, value] of url.searchParams) {
        if (value.startsWith('eq.')) {
          rows = rows.filter((row) => String(row[key]) === value.slice(3))
        } else if (value.startsWith('in.')) {
          const allowed = listOf(value)
          rows = rows.filter((row) => allowed.includes(String(row[key])))
        }
      }
      const order = url.searchParams.get('order')
      if (order) {
        const keys = order.split(',').map((part) => part.split('.')[0]!)
        rows = [...rows].sort((a, b) => {
          for (const key of keys) {
            const [x, y] = [a[key], b[key]] as [
              string | number,
              string | number,
            ]
            if (x < y) return -1
            if (x > y) return 1
          }
          return 0
        })
      }
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? rows.length)
      rows = rows.slice(offset, offset + limit)

      const columns = (url.searchParams.get('select') ?? '*').split(',')
      const body = rows.map((row) =>
        Object.fromEntries(columns.map((column) => [column, row[column]])),
      )
      return Response.json(body)
    },
  )
  return { fetch, requests }
}

const loaderWith = (
  fetch: typeof globalThis.fetch,
  options: { maxChunks?: number; pageSize?: number } = {},
) =>
  createMaterialsLoader({
    clientFor: (token) => createUserClient(CONFIG, token, { fetch }),
    ...options,
  })

describe('createMaterialsLoader', () => {
  it('loads the named materials with their chunks in reading order', async () => {
    const { fetch } = fakePostgrest()

    const materials = await loaderWith(fetch)({
      userId: 'user-1',
      accessToken: 'token-1',
      materialIds: ['doc-1'],
    })

    expect(materials).toEqual([
      {
        id: 'doc-1',
        name: 'Cells.pdf',
        chunks: [
          {
            id: 'doc-1:0',
            text: 'Mitochondria make ATP.',
            source: { type: 'page', page: 1 },
          },
          {
            id: 'doc-1:1',
            text: 'Mitochondria have DNA.',
            source: { type: 'page', page: 2 },
          },
        ],
      },
    ])
  })

  it('queries as the user: their token, the publishable key, and their id', async () => {
    const { fetch, requests } = fakePostgrest()

    await loaderWith(fetch)({
      userId: 'user-1',
      accessToken: 'token-1',
      materialIds: ['doc-1'],
    })

    expect(requests.length).toBeGreaterThan(0)
    for (const { url, headers } of requests) {
      expect(headers.get('authorization')).toBe('Bearer token-1')
      expect(headers.get('apikey')).toBe('sb_publishable_x')
      expect(url.searchParams.get('user_id')).toBe('eq.user-1')
    }
  })

  it("returns nothing for another user's material ids", async () => {
    const { fetch, requests } = fakePostgrest()

    const materials = await loaderWith(fetch)({
      userId: 'user-1',
      accessToken: 'token-1',
      materialIds: ['doc-9'],
    })

    expect(materials).toEqual([])
    // Nothing was found, so no chunk query is spent.
    expect(requests.map(({ url }) => url.pathname)).toEqual([
      '/rest/v1/documents',
    ])
  })

  it('returns only the ids that exist, in the order asked', async () => {
    const { fetch } = fakePostgrest()

    const materials = await loaderWith(fetch)({
      userId: 'user-1',
      accessToken: 'token-1',
      materialIds: ['doc-2', 'missing', 'doc-1', 'doc-9'],
    })

    expect(materials.map(({ id }) => id)).toEqual(['doc-2', 'doc-1'])
  })

  it('makes no request when no materials are named', async () => {
    const { fetch } = fakePostgrest()

    const materials = await loaderWith(fetch)({
      userId: 'user-1',
      accessToken: 'token-1',
      materialIds: [],
    })

    expect(materials).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reads large materials in pages and stops at the chunk cap', async () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      chunkRow('user-1', 'doc-1', i, `Part ${i}`),
    )
    const { fetch, requests } = fakePostgrest({ ...TABLES, chunks: many })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const [material] = await loaderWith(fetch, { pageSize: 2, maxChunks: 5 })({
      userId: 'user-1',
      accessToken: 'token-1',
      materialIds: ['doc-1'],
    })

    expect(material?.chunks.map(({ id }) => id)).toEqual([
      'doc-1:0',
      'doc-1:1',
      'doc-1:2',
      'doc-1:3',
      'doc-1:4',
    ])
    const chunkRequests = requests.filter(({ url }) =>
      url.pathname.endsWith('/chunks'),
    )
    expect(
      chunkRequests.map(({ url }) => url.searchParams.get('limit')),
    ).toEqual(['2', '2', '1'])
    expect(warn).toHaveBeenCalledOnce()
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Part|doc-1/)
    warn.mockRestore()
  })

  it('skips a chunk whose stored source is malformed', async () => {
    const broken = {
      ...chunkRow('user-1', 'doc-1', 0, 'Bad'),
      source: { type: 'time' },
    }
    const good = chunkRow('user-1', 'doc-1', 1, 'Good')
    const { fetch } = fakePostgrest({ ...TABLES, chunks: [broken, good] })

    const [material] = await loaderWith(fetch)({
      userId: 'user-1',
      accessToken: 'token-1',
      materialIds: ['doc-1'],
    })

    expect(material?.chunks.map(({ text }) => text)).toEqual(['Good'])
  })

  it('throws MaterialsUnavailableError when the database refuses', async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        { code: 'PGRST301', message: 'JWT expired' },
        { status: 401 },
      ),
    )

    await expect(
      loaderWith(fetch)({
        userId: 'user-1',
        accessToken: 'token-1',
        materialIds: ['doc-1'],
      }),
    ).rejects.toBeInstanceOf(MaterialsUnavailableError)
  })

  it('throws MaterialsUnavailableError when the database is unreachable', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })

    await expect(
      loaderWith(fetch)({
        userId: 'user-1',
        accessToken: 'token-1',
        materialIds: ['doc-1'],
      }),
    ).rejects.toBeInstanceOf(MaterialsUnavailableError)
  })
})

describe('createMaterialsLoaderFromEnv', () => {
  it('is null without Supabase settings, so chat reports not-configured', () => {
    expect(createMaterialsLoaderFromEnv({})).toBeNull()
  })

  it('builds a loader from the public settings', () => {
    expect(
      createMaterialsLoaderFromEnv({
        VITE_SUPABASE_URL: CONFIG.url,
        VITE_SUPABASE_PUBLISHABLE_KEY: CONFIG.publishableKey,
      }),
    ).toBeTypeOf('function')
  })
})
