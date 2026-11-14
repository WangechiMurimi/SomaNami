import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SupabaseConfig {
  url: string
  publishableKey: string
}

type SupabaseEnv = Pick<
  ImportMetaEnv,
  'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY'
>

/** Reads the public Supabase settings, or `null` when either is missing. */
export function readSupabaseConfig(
  env: SupabaseEnv = import.meta.env,
): SupabaseConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim()
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  return url && publishableKey ? { url, publishableKey } : null
}

// `undefined` means "not built yet"; `null` means "built, but unconfigured".
let client: SupabaseClient | null | undefined

/** The app's single Supabase client, or `null` when the project isn't configured. */
export function getSupabaseClient(): SupabaseClient | null {
  if (client === undefined) {
    const config = readSupabaseConfig()
    client = config ? createClient(config.url, config.publishableKey) : null
  }
  return client
}

/** Swaps the client; tests inject a fake, `undefined` rebuilds from the environment. */
export function setSupabaseClient(next: SupabaseClient | null | undefined) {
  client = next
}
