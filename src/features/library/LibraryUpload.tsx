import DocumentCard from '../upload/DocumentCard.tsx'
import UploadZone from '../upload/UploadZone.tsx'
import { useWorkspaceUpload } from '../workspaces/use-workspace-upload.ts'

/**
 * Uploads into My library, filed under `workspaceId`. Unlike the shared upload
 * section it offers no "Ask about this": the new file appears in the list
 * below, where clicking it starts a chat.
 */
export default function LibraryUpload({
  workspaceId,
}: {
  workspaceId: string
}) {
  const { upload, retry, reset, ...state } = useWorkspaceUpload(workspaceId)
  return (
    <section aria-label="Upload">
      <UploadZone onFile={upload} disabled={state.status === 'processing'} />
      <DocumentCard {...state} onClear={reset} onRetry={retry} />
    </section>
  )
}
