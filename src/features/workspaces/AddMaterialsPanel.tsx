import { useState } from 'react'
import { Clipboard, LinkIcon } from '../../components/icons.tsx'
import AddLinkForm from '../upload/AddLinkForm.tsx'
import DocumentCard from '../upload/DocumentCard.tsx'
import PasteTextForm from '../upload/PasteTextForm.tsx'
import UploadZone from '../upload/UploadZone.tsx'
import type { useDocumentUpload } from '../upload/use-document-upload.ts'
import { SECONDARY } from './button-styles.ts'

type Upload = ReturnType<typeof useDocumentUpload>

const SECONDARY =
  'inline-flex h-11 items-center gap-[0.5625rem] rounded-[10px] border border-edge bg-surface px-[1.125rem] text-sm font-medium text-fg hover:bg-tint'

/** Upload, link or paste materials into a workspace, with the upload's progress. */
export default function AddMaterialsPanel({
  upload: { upload, uploadLink, retry, reset, ...state },
  pasting,
  onPastingChange,
}: {
  upload: Upload
  pasting: boolean
  onPastingChange: (pasting: boolean) => void
}) {
  // Unlike pasting, nothing outside the panel opens the link form.
  const [linking, setLinking] = useState(false)
  const busy = state.status === 'processing'
  return (
    <section
      aria-label="Add materials"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
    >
      <UploadZone onFile={upload} disabled={busy} />
      <DocumentCard {...state} onClear={reset} onRetry={retry} />
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
      {linking && (
        <AddLinkForm
          disabled={busy}
          onLink={(url) => {
            void uploadLink(url)
            setLinking(false)
          }}
          onCancel={() => setLinking(false)}
        />
      )}
      {!(pasting && linking) && (
        <div className="flex flex-wrap gap-3">
          {!linking && (
            <button
              type="button"
              onClick={() => setLinking(true)}
              className={SECONDARY}
            >
              <LinkIcon size={18} strokeWidth={1.8} />
              Add a link
            </button>
          )}
          {!pasting && (
            <button
              type="button"
              onClick={() => onPastingChange(true)}
              className={SECONDARY}
            >
              <Clipboard size={18} strokeWidth={1.8} />
              Paste text
            </button>
          )}
        </div>
      )}
    </section>
  )
}
