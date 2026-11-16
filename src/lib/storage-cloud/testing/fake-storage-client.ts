import type { SupabaseClient } from '@supabase/supabase-js'
import { vi } from 'vitest'

export interface FakeStorageOptions {
  /** The signed-in user's id, or `null` for no session. */
  userId?: string | null
  /** Makes every upload fail with this message. */
  uploadError?: string
}

/**
 * Just enough of a Supabase client for originals.ts: a session and a
 * `materials` bucket that remembers uploads, so tests can assert on paths.
 */
export function createFakeStorageClient({
  userId = 'user-1',
  uploadError,
}: FakeStorageOptions = {}) {
  const objects = new Map<string, File>()
  // Typed with the options argument so tests can assert on what was sent.
  const upload = vi.fn<
    (
      path: string,
      file: File,
      options?: Record<string, unknown>,
    ) => Promise<{ data: { path: string } | null; error: Error | null }>
  >(async (path, file) => {
    if (uploadError) return { data: null, error: new Error(uploadError) }
    objects.set(path, file)
    return { data: { path }, error: null }
  })
  const remove = vi.fn(async (paths: string[]) => {
    for (const path of paths) objects.delete(path)
    return { data: [], error: null }
  })
  const from = vi.fn(() => ({ upload, remove }))
  const client = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: userId ? { user: { id: userId } } : null },
        error: null,
      })),
    },
    storage: { from },
  } as unknown as SupabaseClient

  return { client, objects, upload, remove, from }
}
