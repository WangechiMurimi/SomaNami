import { useCallback, useEffect, useState } from 'react'
import { listDocuments, saveDocument } from '../../lib/storage/index.ts'
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

  return { documents, status, add }
}
