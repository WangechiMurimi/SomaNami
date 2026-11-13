import { Clipboard } from '../../components/icons.tsx'
import DocumentCard from '../upload/DocumentCard.tsx'
import PasteTextForm from '../upload/PasteTextForm.tsx'
import UploadZone from '../upload/UploadZone.tsx'
import type { useDocumentUpload } from '../upload/use-document-upload.ts'

type Upload = ReturnType<typeof useDocumentUpload>

/** Upload or paste materials into a workspace, with the upload's progress. */
export default function AddMaterialsPanel({
  upload: { upload, retry, reset, ...state },
  pasting,
  onPastingChange,
}: {
  upload: Upload
  pasting: boolean
  onPastingChange: (pasting: boolean) => void
}) {
  const busy = state.status === 'processing'
  return (
    <section
      aria-label="Add materials"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
    >
      <UploadZone onFile={upload} disabled={busy} />
      <DocumentCard {...state} onClear={reset} onRetry={retry} />
      {pasting ? (
        <PasteTextForm
          disabled={busy}
          onFile={(file) => {
            void upload(file)
            onPastingChange(false)
          }}
          onCancel={() => onPastingChange(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => onPastingChange(true)}
          className="inline-flex h-11 items-center gap-[9px] self-start rounded-[10px] border border-edge bg-surface px-[18px] text-sm font-medium text-fg hover:bg-tint"
        >
          <Clipboard size={18} strokeWidth={1.8} />
          Paste text
        </button>
      )}
    </section>
  )
}
