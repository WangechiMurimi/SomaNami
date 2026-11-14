import { getSupabaseClient } from './supabase-client.ts'

/** Whether this build has a Supabase project to sign in against. */
export function isAuthConfigured(): boolean {
  return getSupabaseClient() !== null
}
