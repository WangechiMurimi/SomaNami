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

/**
 * Whether the browser reports no network. Offline, supabase-js can't refresh
 * a saved session and reports none, so a missing token means "no connection",
 * not "signed out": callers then offer a retry instead of ending the session.
 */
export const isOffline = (): boolean =>
  typeof navigator !== 'undefined' && navigator.onLine === false
