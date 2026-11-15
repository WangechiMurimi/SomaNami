import { useCallback, useEffect, useState } from 'react'
import {
  removeOriginal,
  uploadOriginal,
} from '../../lib/storage-cloud/originals.ts'
import {
  deleteDocument,
  getDocument,
  listDocuments,
  saveDocument,
} from '../../lib/storage/index.ts'
import type { NewDocument, StoredDocument } from '../../types/contracts.ts'
import { MAX_FILE_BYTES } from '../upload/constants.ts'

export type LibraryStatus = 'loading' | 'ready' | 'error'

const byName = (a: StoredDocument, b: StoredDocument) =>
  a.name.localeCompare(b.name)

/**
 * Uploads a saved material's original file and records where it went.
 * Resolves to the updated document, or `null` when nothing was uploaded.
 */
async function keepOriginal(
  stored: StoredDocument,
  file: File,
): Promise<StoredDocument | null> {
  const path = await uploadOriginal(stored.id, file, {
    maxBytes: MAX_FILE_BYTES,
  })
  if (!path) return null
  // The learner may have deleted the material while its file uploaded: keep
  // it deleted, and don't leave the file behind in their account.
  const current = await getDocument(stored.id)
  if (!current) {
    await removeOriginal(path)
    return null
  }
  return saveDocument({ ...current, storagePath: path })
}

/** The documents stored on this device, kept in sync with local storage. */
export function useLibrary() {
  const [documents, setDocuments] = useState<StoredDocument[]>([])
  const [status, setStatus] = useState<LibraryStatus>('loading')

  useEffect(() => {
    let cancelled = false
    listDocuments()
      .then((stored) => {
        if (cancelled) return
        // Merge rather than replace: an upload may finish before this load.
        setDocuments((current) => {
          const ids = new Set(current.map(({ id }) => id))
          return [...current, ...stored.filter(({ id }) => !ids.has(id))].sort(
            byName,
          )
        })
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        console.error('Could not load stored documents', error)
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const put = useCallback((stored: StoredDocument) => {
    setDocuments((current) =>
      [...current.filter(({ id }) => id !== stored.id), stored].sort(byName),
    )
  }, [])

  /**
   * Saves a parsed material into a workspace (the default one if omitted).
   * The `original` file is then uploaded to the learner's account in the
   * background: the material is usable on this device straight away, and
   * offline or unconfigured builds simply skip the upload.
   */
  const add = useCallback(
    async (document: NewDocument, workspaceId?: string, original?: File) => {
      const stored = await saveDocument(document, workspaceId)
      put(stored)
      if (original) {
        keepOriginal(stored, original)
          .then((updated) => updated && put(updated))
          .catch((error: unknown) => {
            // The device copy is safe, so this is not the learner's problem.
            // TODO(#146): keep the file until it uploads, so this can retry.
            console.warn('Could not upload the original file', error)
          })
      }
      return stored
    },
    [put],
  )

  /**
   * Removes a material from this device. Chats that used only it go too;
   * chats with other materials keep those (US-08 AC5).
   */
  const remove = useCallback(async (id: string) => {
    await deleteDocument(id)
    setDocuments((current) => current.filter((document) => document.id !== id))
  }, [])

  return { documents, status, add, remove }
}
