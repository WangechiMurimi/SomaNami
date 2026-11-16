import type { RefObject } from 'react'
import { Clipboard, LinkIcon, Trash } from '../../components/icons.tsx'
import type { NewDocument } from '../../types/contracts.ts'
import AddLinkForm from '../upload/AddLinkForm.tsx'
import DocumentCard from '../upload/DocumentCard.tsx'
import PasteTextForm from '../upload/PasteTextForm.tsx'
import UploadZone from '../upload/UploadZone.tsx'
import type { useDocumentUpload } from '../upload/use-document-upload.ts'
import { SECONDARY } from './button-styles.ts'

type Upload = ReturnType<typeof useDocumentUpload>

/**
 * Step two of the new-workspace wizard: upload, link or paste materials, and
 * see what has been added so far. The wizard owns every piece of state, so
 * going back to step one and returning keeps it.
 */
export default function MaterialsStep({
  id,
  headingRef,
  upload: { upload, uploadLink, retry, reset, ...uploadState },
  linking,
  onLinkingChange,
  pasting,
  onPastingChange,
  added,
  onRemove,
}: {
  /** Prefix for the step's ids. */
  id: string
  headingRef: RefObject<HTMLHeadingElement | null>
  upload: Upload
  linking: boolean
  onLinkingChange: (linking: boolean) => void
  pasting: boolean
  onPastingChange: (pasting: boolean) => void
  /** Materials parsed so far, saved only when the workspace is created. */
  added: NewDocument[]
  onRemove: (documentId: string) => void
}) {
  const busy = uploadState.status === 'processing'
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl leading-[1.3] font-medium outline-none"
        >
          Add the materials it should learn from
        </h2>
        <p className="text-[15px] leading-[1.6] text-muted">
          Chats here answer only from what you add. You can add more at any
          time.
        </p>
      </div>

      <section aria-label="Upload" className="flex flex-col gap-4">
        <UploadZone onFile={upload} disabled={busy} />
        <DocumentCard {...uploadState} onClear={reset} onRetry={retry} />
      </section>

      <div className="flex flex-wrap gap-3">
        {!linking && (
          <button
            type="button"
            onClick={() => onLinkingChange(true)}
            className={`${SECONDARY} self-start`}
          >
            <LinkIcon size={18} strokeWidth={1.8} />
            Add a link
          </button>
        )}
        {!pasting && (
          <button
            type="button"
            onClick={() => onPastingChange(true)}
            className={`${SECONDARY} self-start`}
          >
            <Clipboard size={18} strokeWidth={1.8} />
            Paste text
          </button>
        )}
      </div>
      {linking && (
        <AddLinkForm
          disabled={busy}
          onLink={(url) => {
            void uploadLink(url)
            onLinkingChange(false)
          }}
          onCancel={() => onLinkingChange(false)}
        />
      )}
      {pasting && (
        <PasteTextForm
          disabled={busy}
          onFile={(file) => {
            void upload(file)
            onPastingChange(false)
          }}
          onCancel={() => onPastingChange(false)}
        />
      )}

      {added.length > 0 && (
        <section aria-labelledby={`${id}-added`}>
          <h3 id={`${id}-added`} className="text-[15px] font-medium">
            Added so far
          </h3>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {added.map((document) => (
              <li
                key={document.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {document.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(document.id)}
                  className="inline-flex size-11 flex-none items-center justify-center rounded-[10px] text-muted hover:bg-tint hover:text-warn"
                >
                  <Trash size={18} strokeWidth={1.8} />
                  <span className="sr-only">Remove {document.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
