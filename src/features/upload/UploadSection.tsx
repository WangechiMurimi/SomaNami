import { useCallback } from 'react'
import { Link } from 'react-router'
import type { StoredDocument } from '../../types/contracts.ts'
import { useLibraryContext } from '../library/library-context.ts'
import DocumentCard from './DocumentCard.tsx'
import UploadZone from './UploadZone.tsx'
import { UploadError } from './upload-error.ts'
import { useDocumentUpload } from './use-document-upload.ts'

/** Upload, save to the library, then offer to start asking about it. */
export default function UploadSection() {
  const { add } = useLibraryContext()

  const keepDocument = useCallback(
    async (document: StoredDocument) => {
      try {
        await add(document)
      } catch (cause) {
        // Parsing worked, so tell the user it's the saving that failed.
        throw new UploadError(
          'save-failed',
          'We read the file but couldn’t save it on this device. Free up some space and try again.',
          { retryable: true, cause },
        )
      }
    },
    [add],
  )

  const { upload, retry, reset, ...state } = useDocumentUpload({
    onReady: keepDocument,
  })

  return (
    <section aria-label="Upload">
      <UploadZone onFile={upload} disabled={state.status === 'processing'} />
      <DocumentCard {...state} onClear={reset} onRetry={retry} />
      {state.status === 'ready' && (
        <Link
          to={`/chat/${state.document.id}`}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-[10px] bg-accent px-[18px] text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
        >
          Ask about this
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      )}
    </section>
  )
}
