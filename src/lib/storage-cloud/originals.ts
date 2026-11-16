import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from '../auth/supabase-client.ts'

/** The private bucket holding learners' original files (#145). */
export const MATERIALS_BUCKET = 'materials'

const MAX_NAME_CHARS = 120

/**
 * Storage keys only accept a narrow ASCII set, so a name like "Biología.pdf"
 * would be refused outright. Accents are dropped, anything else unusual
 * (including `/`) becomes `_`, and the tail is kept so the extension survives.
 */
function safeFileName(fileName: string): string {
  const safe = fileName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.\- ]+/g, '_')
    .slice(-MAX_NAME_CHARS)
    // A leading dot would make `.` or `..` path segments possible.
    .replace(/^[.\s]+/, '')
    .trim()
  return safe || 'file'
}

/** Where a document's original lives: `{userId}/{documentId}/{file name}`. */
export function originalPath(
  userId: string,
  documentId: string,
  fileName: string,
): string {
  return `${userId}/${documentId}/${safeFileName(fileName)}`
}

export interface UploadOriginalOptions {
  /** Larger files are skipped; the bucket would refuse them anyway. */
  maxBytes: number
  client?: SupabaseClient | null
  online?: boolean
}

/**
 * Uploads a material's original file to the signed-in learner's folder and
 * resolves to its path. Resolves to `null`, without a request, when there is
 * nothing to upload to right now: no Supabase project, offline, signed out,
 * or the file is over the limit. A failed upload rejects.
 */
export async function uploadOriginal(
  documentId: string,
  file: File,
  {
    maxBytes,
    client = getSupabaseClient(),
    online = navigator.onLine,
  }: UploadOriginalOptions,
): Promise<string | null> {
  if (!client || !online || file.size > maxBytes) return null
  // The session, not the cached user, so the folder always matches the token
  // the request is signed with; RLS would refuse any other folder.
  const { data } = await client.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) return null

  const path = originalPath(userId, documentId, file.name)
  const { error } = await client.storage
    .from(MATERIALS_BUCKET)
    .upload(path, file, {
      // A retried upload of the same material replaces its earlier copy.
      upsert: true,
      contentType: file.type || 'application/octet-stream',
    })
  if (error) throw error
  return path
}

/** Deletes an uploaded original; a missing object counts as deleted. */
export async function removeOriginal(
  path: string,
  client: SupabaseClient | null = getSupabaseClient(),
): Promise<void> {
  if (!client) return
  const { error } = await client.storage.from(MATERIALS_BUCKET).remove([path])
  if (error) throw error
}
