import { useCallback, useRef, useState } from 'react'
import { DEFAULT_WORKSPACE } from '../../lib/storage/index.ts'
import type { StoredDocument } from '../../types/contracts.ts'
import { useLibraryContext } from '../library/library-context.ts'
import { parseDocument, UploadError } from '../upload/parse-document.ts'
import { toUploadErrorState } from '../upload/use-document-upload.ts'
import type { UploadErrorState } from '../upload/use-document-upload.ts'

/** One file attached to Home's question, from upload to a stored material. */
export type Attachment =
  | { key: string; fileName: string; status: 'processing' }
  | {
      key: string
      fileName: string
      status: 'ready'
      document: StoredDocument
    }
  | {
      key: string
      fileName: string
      status: 'error'
      error: UploadErrorState
    }

// Worded like the other upload screens' save failure.
const SAVE_FAILED =
  'We read the file but couldn’t save it on this device. Free up some space and try again.'

let attachmentCount = 0
const nextKey = (): string => `attachment-${++attachmentCount}`

/**
 * Files attached to one question. Each is read and saved to the default
 * workspace on its own, so several can upload at once and fail or be retried
 * independently. Removing one takes it out of the library too: it was only
 * added for this question.
 */
export function useAttachments() {
  const { add, remove: removeDocument } = useLibraryContext()
  const [attachments, setAttachments] = useState<Attachment[]>([])
  // The files still attached, so a retry can re-read one and a late result
  // for a removed one can be discarded.
  const files = useRef(new Map<string, File>())

  const replace = useCallback((next: Attachment) => {
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.key === next.key ? next : attachment,
      ),
    )
  }, [])

  const read = useCallback(
    async (key: string, file: File) => {
      const fileName = file.name
      replace({ key, fileName, status: 'processing' })
      try {
        const parsed = await parseDocument(file)
        let document: StoredDocument
        try {
          document = await add(parsed, DEFAULT_WORKSPACE.id)
        } catch (cause) {
          // Parsing worked, so say it's the saving that failed.
          throw new UploadError('save-failed', SAVE_FAILED, {
            retryable: true,
            cause,
          })
        }
        if (!files.current.has(key)) {
          // Removed while it was uploading: don't leave it in the library.
          await removeDocument(document.id)
          return
        }
        replace({ key, fileName, status: 'ready', document })
      } catch (error) {
        replace({
          key,
          fileName,
          status: 'error',
          error: toUploadErrorState(error),
        })
      }
    },
    [add, removeDocument, replace],
  )

  const attach = useCallback(
    (file: File | null | undefined) => {
      if (!file) return
      const key = nextKey()
      files.current.set(key, file)
      setAttachments((current) => [
        ...current,
        { key, fileName: file.name, status: 'processing' },
      ])
      void read(key, file)
    },
    [read],
  )

  const retry = useCallback(
    (key: string) => {
      const file = files.current.get(key)
      if (file) void read(key, file)
    },
    [read],
  )

  const remove = useCallback(
    (attachment: Attachment) => {
      files.current.delete(attachment.key)
      setAttachments((current) =>
        current.filter(({ key }) => key !== attachment.key),
      )
      if (attachment.status === 'ready') {
        removeDocument(attachment.document.id).catch((error: unknown) =>
          console.error('Could not remove the attached file', error),
        )
      }
    },
    [removeDocument],
  )

  return { attachments, attach, retry, remove }
}
