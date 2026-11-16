import process from 'node:process'

/**
 * The project URL from `SUPABASE_URL`, falling back to the browser's
 * `VITE_SUPABASE_URL` (the same public value) so one setting suffices. Kept
 * apart from the Supabase client so reading it pulls in no SDK.
 */
export function supabaseUrlFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env.SUPABASE_URL?.trim() || env.VITE_SUPABASE_URL?.trim()
}
