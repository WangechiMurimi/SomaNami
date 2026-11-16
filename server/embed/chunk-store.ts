import process from 'node:process'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  createUserClient,
  supabaseConfigFromEnv,
} from '../supabase/user-client.ts'

/** A chunk still waiting for its embedding. */
export interface PendingChunk {
  id: string
  text: string
}

/** One chunk's vector, ready to store. */
export interface ChunkEmbedding {
  id: string
  embedding: number[]
}

/** The signed-in learner's chunks, read and written with their own rights. */
export interface ChunkStore {
  /** Up to `limit` chunks without an embedding, in reading order. */
  pending(limit: number): Promise<PendingChunk[]>
  /** Stores each vector on its chunk; chunks deleted meanwhile are skipped. */
  save(embeddings: readonly ChunkEmbedding[]): Promise<void>
}

/** Whose chunks: the verified user and their own access token. */
export interface ChunkStoreSession {
  userId: string
  accessToken: string
}

/** Opens the learner's chunk store for one request. */
export type ChunkStoreFor = (session: ChunkStoreSession) => ChunkStore

/** The database could not be read or written; a server-side problem. */
export class ChunkStoreError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Could not reach the chunk store', options)
    this.name = 'ChunkStoreError'
  }
}

// Rows are written by the learner's devices, so they are checked like any
// other client input before their text reaches the model.
const pendingRow = z.object({ id: z.string().min(1), text: z.string() })

export interface ChunkStoreOptions {
  /** Builds a client that acts as the user holding `accessToken`. */
  clientFor: (accessToken: string) => Pick<SupabaseClient, 'from'>
}

/**
 * Builds a chunk store that queries `chunks` as the signed-in user, so RLS
 * limits every read and write to their own rows (#143).
 */
export function createChunkStore({
  clientFor,
}: ChunkStoreOptions): ChunkStoreFor {
  return ({ userId, accessToken }) => {
    const client = clientFor(accessToken)
    return {
      async pending(limit) {
        const { data, error } = await client
          .from('chunks')
          .select('id,text')
          // Also filtered on, so the primary key's user_id prefix is used.
          .eq('user_id', userId)
          .is('embedding', null)
          .order('document_id')
          .order('position')
          .limit(limit)
        if (error) throw new ChunkStoreError({ cause: error })
        const rows: unknown[] = Array.isArray(data) ? data : []
        return rows.flatMap((row) => {
          const parsed = pendingRow.safeParse(row)
          // One malformed row shouldn't hold back every other chunk.
          return parsed.success ? [parsed.data] : []
        })
      },

      async save(embeddings) {
        // PostgREST has no bulk update of different values per row, and an
        // upsert would resurrect a chunk deleted since it was read. Each
        // update is small, and a request saves at most a few dozen.
        const results = await Promise.all(
          embeddings.map(({ id, embedding }) =>
            client
              .from('chunks')
              .update({ embedding })
              .eq('user_id', userId)
              .eq('id', id),
          ),
        )
        const failed = results.find(({ error }) => error)
        if (failed) throw new ChunkStoreError({ cause: failed.error })
      },
    }
  }
}

/**
 * Builds the store from the public Supabase settings, or `null` when they are
 * missing, so the route reports not-configured instead of crashing.
 */
export function createChunkStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ChunkStoreFor | null {
  const config = supabaseConfigFromEnv(env)
  if (!config) return null
  return createChunkStore({
    clientFor: (accessToken) => createUserClient(config, accessToken),
  })
}
