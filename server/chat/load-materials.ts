import process from 'node:process'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Chunk } from '../../src/types/contracts.ts'
import {
  createUserClient,
  supabaseConfigFromEnv,
} from '../supabase/user-client.ts'

/** Which materials to load, and whose. */
export interface MaterialsQuery {
  /** The verified user id; also filtered on, so the primary key index is used. */
  userId: string
  /** The user's own access token, so RLS scopes every row to them. */
  accessToken: string
  materialIds: readonly string[]
}

/** One material with every chunk retrieval may rank. */
export interface LoadedMaterial {
  id: string
  name: string
  chunks: Chunk[]
}

/**
 * Loads the requested materials the caller owns. Ids the caller doesn't own,
 * or that don't exist, are simply absent from the result. Throws
 * `MaterialsUnavailableError` when the database can't be read.
 */
export type LoadMaterials = (query: MaterialsQuery) => Promise<LoadedMaterial[]>

/** The database could not be read; a server-side problem, not the caller's. */
export class MaterialsUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Could not load chat materials', options)
    this.name = 'MaterialsUnavailableError'
  }
}

/**
 * Most chunks ranked per question. BM25 runs in memory over every loaded
 * chunk, so this bounds one request's memory and time: 5,000 chunks of at most
 * 1,200 characters is about 6 MB, many hundreds of pages of material.
 * TODO(#154): vector search in the database removes the need to load them all.
 */
export const MAX_CHUNKS = 5_000

// PostgREST returns at most `max_rows` (1,000, see supabase/config.toml) per
// request, so larger sets are read in pages of that size.
const PAGE_SIZE = 1_000

const source = z.discriminatedUnion('type', [
  z.object({ type: z.literal('page'), page: z.number().int().positive() }),
  z.object({
    type: z.literal('paragraph'),
    paragraph: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('line'),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  }),
])

const documentRows = z.array(z.object({ id: z.string(), name: z.string() }))

// Rows are written by the user's own devices, so they are checked like any
// other client input before they reach the model or the reply.
const chunkRow = z.object({
  id: z.string(),
  document_id: z.string(),
  text: z.string(),
  source,
})

export interface MaterialsLoaderOptions {
  /** Builds a client that acts as the user holding `accessToken`. */
  clientFor: (accessToken: string) => Pick<SupabaseClient, 'from'>
  maxChunks?: number
  pageSize?: number
}

/** Builds a loader that reads `documents` and `chunks` as the signed-in user. */
export function createMaterialsLoader({
  clientFor,
  maxChunks = MAX_CHUNKS,
  pageSize = PAGE_SIZE,
}: MaterialsLoaderOptions): LoadMaterials {
  return async ({ userId, accessToken, materialIds }) => {
    if (materialIds.length === 0) return []
    const client = clientFor(accessToken)

    const documents = await client
      .from('documents')
      .select('id, name')
      .eq('user_id', userId)
      .in('id', [...materialIds])
    if (documents.error) {
      throw new MaterialsUnavailableError({ cause: documents.error })
    }
    const found = documentRows.safeParse(documents.data)
    if (!found.success) throw new MaterialsUnavailableError()

    const byId = new Map<string, LoadedMaterial>(
      found.data.map(({ id, name }) => [id, { id, name, chunks: [] }]),
    )
    if (byId.size === 0) return []

    for (let from = 0; from < maxChunks; from += pageSize) {
      const to = Math.min(from + pageSize, maxChunks) - 1
      const page = await client
        .from('chunks')
        .select('id, document_id, text, source')
        .eq('user_id', userId)
        .in('document_id', [...byId.keys()])
        // Matches chunks_document_idx, and keeps truncation deterministic.
        .order('document_id')
        .order('position')
        .range(from, to)
      if (page.error) throw new MaterialsUnavailableError({ cause: page.error })
      const rows: unknown[] = Array.isArray(page.data) ? page.data : []

      for (const row of rows) {
        const chunk = chunkRow.safeParse(row)
        // One malformed row shouldn't cost the learner every other passage.
        if (!chunk.success) continue
        const { id, document_id, text, source } = chunk.data
        byId.get(document_id)?.chunks.push({ id, text, source })
      }

      if (rows.length < to - from + 1) break
      if (to + 1 >= maxChunks) {
        // Counts only: chunk text and ids are the learner's content.
        console.warn(
          `Chat materials reached ${maxChunks} chunks; ranking only those`,
        )
      }
    }

    // In the order the client listed them, so ranking ties stay stable.
    return materialIds.flatMap((id) => byId.get(id) ?? [])
  }
}

/**
 * Builds the loader from the public Supabase settings, or `null` when they are
 * missing, so the chat route reports not-configured instead of crashing.
 */
export function createMaterialsLoaderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LoadMaterials | null {
  const config = supabaseConfigFromEnv(env)
  if (!config) return null
  return createMaterialsLoader({
    clientFor: (accessToken) => createUserClient(config, accessToken),
  })
}
