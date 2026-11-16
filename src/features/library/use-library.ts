import { useCallback, useEffect, useState } from 'react'
import {
  removeOriginal,
  uploadOriginal,
} from '../../lib/storage-cloud/originals.ts'
import {
  deleteDocument,
  deleteWorkspace,
  getDocument,
  listDocuments,
  moveDocument,
  saveDocument,
  subscribeToDocuments,
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
    let latest = 0
    // Reloads on every document change, including ones made elsewhere (another
    // screen, or a sync pull). Only the newest load applies, so an older one
    // that resolves late can't bring back a removed document or drop a saved
    // one; that also makes replacing the list safe when an upload finishes
    // mid-load, because the save starts a newer load.
    const load = () => {
      const request = ++latest
      listDocuments()
        .then((stored) => {
          if (cancelled || request !== latest) return
          setDocuments(stored)
          setStatus('ready')
        })
        .catch((error: unknown) => {
          if (cancelled || request !== latest) return
          console.error('Could not load stored documents', error)
          setStatus('error')
        })
    }
    load()
    const unsubscribe = subscribeToDocuments(load)
    return () => {
      cancelled = true
      unsubscribe()
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

  /**
   * Files a material into another workspace (Add / Remove sources). It stays
   * in the library either way; only the workspace it belongs to changes.
   */
  const move = useCallback(async (id: string, workspaceId: string) => {
    const moved = await moveDocument(id, workspaceId)
    setDocuments((current) =>
      current.map((document) => (document.id === id ? moved : document)),
    )
    return moved
  }, [])

  /** Deletes a workspace with its chats and materials, and drops them here. */
  const removeWorkspace = useCallback(async (workspaceId: string) => {
    await deleteWorkspace(workspaceId)
    setDocuments((current) =>
      current.filter((document) => document.workspaceId !== workspaceId),
    )
  }, [])

  return { documents, status, add, remove, move, removeWorkspace }
}
