import { getSupabaseClient } from './supabase-client.ts'

/** The details a learner gives after creating an account (#142). */
export interface Profile {
  displayName: string | null
  age13Plus: boolean
}

/** What the details step saves. */
export interface ProfileInput {
  displayName: string
  age13Plus: boolean
}

/** Longest display name the `profiles` check constraint accepts. */
export const MAX_DISPLAY_NAME = 100

interface ProfileRow {
  display_name: string | null
  age_13_plus: boolean
}

function requireClient() {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/** The user's profile row, or `null` when they haven't saved one yet. Throws on failure. */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await requireClient()
    .from('profiles')
    .select('display_name, age_13_plus')
    .eq('id', userId)
    .maybeSingle<ProfileRow>()
  if (error) throw error
  return data
    ? { displayName: data.display_name, age13Plus: data.age_13_plus }
    : null
}

/**
 * Creates or replaces the user's profile. RLS limits it to the caller's own
 * row, and the database sets both timestamps. Throws on failure.
 */
export async function saveProfile(
  userId: string,
  input: ProfileInput,
): Promise<void> {
  const { error } = await requireClient().from('profiles').upsert({
    id: userId,
    display_name: input.displayName.trim(),
    age_13_plus: input.age13Plus,
  })
  if (error) throw error
}

/** Whether the profile has everything the app needs before it opens. */
export function isProfileComplete(profile: Profile | null): boolean {
  return Boolean(profile?.age13Plus && profile.displayName?.trim())
}
