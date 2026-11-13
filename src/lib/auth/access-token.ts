import { getSupabaseClient } from './supabase-client.ts'

/**
 * The access token for `Authorization: Bearer`, or `null` when signed out or
 * unconfigured. Pass `refresh` after a 401 to force a new token.
 */
export async function getAccessToken({
  refresh = false,
}: { refresh?: boolean } = {}): Promise<string | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data } = refresh
    ? await supabase.auth.refreshSession()
    : await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
