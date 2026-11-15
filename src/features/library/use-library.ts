import { useCallback, useEffect, useState } from 'react'
import {
  deleteDocument,
  listDocuments,
  saveDocument,
  subscribeToDocuments,
} from '../../lib/storage/index.ts'
import type { NewDocument, StoredDocument } from '../../types/contracts.ts'

export type LibraryStatus = 'loading' | 'ready' | 'error'

const byName = (a: StoredDocument, b: StoredDocument) =>
  a.name.localeCompare(b.name)

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

  /** Saves a parsed material into a workspace (the default one if omitted). */
  const add = useCallback(
    async (document: NewDocument, workspaceId?: string) => {
      const stored = await saveDocument(document, workspaceId)
      setDocuments((current) =>
        [...current.filter(({ id }) => id !== stored.id), stored].sort(byName),
      )
      return stored
    },
    [],
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
