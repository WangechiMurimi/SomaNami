import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseUrlFromEnv } from './env.ts'

/** The public project settings the server needs to query as a user. */
export interface SupabaseServerConfig {
  url: string
  /** The publishable (anon) key. Never the service-role or secret key. */
  publishableKey: string
}

/**
 * Reads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, each falling back to
 * the browser's `VITE_*` value (the same public settings), so one pair of
 * settings is enough. Returns `null` when either is missing, or when the key
 * is a secret one: the server must only ever act with the user's own rights.
 */
export function supabaseConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseServerConfig | null {
  const url = supabaseUrlFromEnv(env)
  const publishableKey =
    env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !publishableKey) return null
  if (isSecretKey(publishableKey)) {
    // Refuse rather than run: a secret key bypasses RLS, so one user's chat
    // could read another user's materials.
    console.error(
      'SUPABASE_PUBLISHABLE_KEY holds a secret key; chat materials are disabled',
    )
    return null
  }
  return { url, publishableKey }
}

/**
 * True for keys that bypass RLS: the new `sb_secret_…` keys and the legacy
 * JWT-shaped `service_role` key.
 */
export function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true
  const [, payload] = key.split('.')
  if (!payload) return false
  try {
    const claims: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    )
    return (
      typeof claims === 'object' &&
      claims !== null &&
      'role' in claims &&
      claims.role === 'service_role'
    )
  } catch {
    return false
  }
}

/**
 * Builds a client for one request that acts as the signed-in user: PostgREST
 * sees the user's own bearer token, so RLS limits every query to their rows.
 * Nothing is persisted or refreshed; the client lives as long as the request.
 */
export function createUserClient(
  { url, publishableKey }: SupabaseServerConfig,
  accessToken: string,
  { fetch }: { fetch?: typeof globalThis.fetch } = {},
): SupabaseClient {
  return createClient(url, publishableKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
      ...(fetch ? { fetch } : {}),
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    // PostgREST's built-in retries back off for up to 7 seconds, most of a
    // serverless request's budget. Fail fast instead: the chat client already
    // offers "Try again" on a 5xx.
    db: { retry: false },
  })
}
