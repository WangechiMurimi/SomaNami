import { useCallback } from 'react'
import type { NewDocument, StoredDocument } from '../../types/contracts.ts'
import { useLibraryContext } from '../library/library-context.ts'
import { UploadError } from '../upload/upload-error.ts'
import { useDocumentUpload } from '../upload/use-document-upload.ts'

/**
 * Uploads (or pasted text) saved straight into one workspace. `onAdded` runs
 * with the stored material, e.g. so New chat can select it.
 */
export function useWorkspaceUpload(
  workspaceId: string,
  onAdded?: (material: StoredDocument) => void,
) {
  const { add } = useLibraryContext()

  const keep = useCallback(
    async (document: NewDocument) => {
      let stored: StoredDocument
      try {
        stored = await add(document, workspaceId)
      } catch (cause) {
        // Parsing worked, so tell the user it's the saving that failed.
        throw new UploadError(
          'save-failed',
          'We read the file but couldn’t save it on this device. Free up some space and try again.',
          { retryable: true, cause },
        )
      }
      onAdded?.(stored)
    },
    [add, workspaceId, onAdded],
  )

  return useDocumentUpload({ onReady: keep })
}
