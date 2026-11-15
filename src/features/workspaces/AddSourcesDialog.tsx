import { useState } from 'react'
import { isLooseWorkspace } from '../../lib/storage/index.ts'
import type { Workspace } from '../../types/contracts.ts'
import { useLibraryContext } from '../library/library-context.ts'
import DocumentCard from '../upload/DocumentCard.tsx'
import UploadZone from '../upload/UploadZone.tsx'
import Dialog, { DIALOG_PRIMARY, DIALOG_SECONDARY } from './Dialog.tsx'
import SourceChecklist from './SourceChecklist.tsx'
import { useWorkspaceUpload } from './use-workspace-upload.ts'
import { useWorkspaces } from './use-workspaces.ts'

const sources = (n: number) => `${n} ${n === 1 ? 'source' : 'sources'}`

/**
 * Adds sources to a workspace: files already in My library move in, and new
 * files can be uploaded straight into it.
 */
export default function AddSourcesDialog({
  workspace,
  onClose,
}: {
  workspace: Workspace
  onClose: () => void
}) {
  const { documents, move } = useLibraryContext()
  const { workspaces } = useWorkspaces()
  const { upload, retry, reset, ...uploadState } = useWorkspaceUpload(
    workspace.id,
  )
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const available = documents.filter(
    ({ workspaceId }) => workspaceId !== workspace.id,
  )
  // A file can sit in one workspace only, so say when adding it moves it.
  const whereIs = ({ workspaceId }: { workspaceId: string }) => {
    if (isLooseWorkspace(workspaceId)) return 'In My library'
    const name = workspaces.find(({ id }) => id === workspaceId)?.name
    return name ? `Moves here from ${name}` : 'In My library'
  }

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((other) => other !== id)
        : [...current, id],
    )

  const add = async () => {
    setBusy(true)
    setError(null)
    try {
      for (const id of selected) await move(id, workspace.id)
      onClose()
    } catch (cause) {
      console.error('Could not add the sources', cause)
      setError('We couldn’t add every source. Try again.')
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={`Add sources to ${workspace.name}`}
      description="Chats in this workspace answer only from its sources."
      onClose={onClose}
    >
      {available.length > 0 ? (
        <SourceChecklist
          legend="From My library"
          materials={available}
          selected={selected}
          onToggle={toggle}
          detail={whereIs}
        />
      ) : (
        <p className="text-sm text-muted">
          Every file in My library is already in this workspace.
        </p>
      )}

      <section aria-label="Upload new files" className="flex flex-col gap-3">
        <h3 className="text-xs leading-[1.5] font-semibold tracking-[0.08em] text-muted uppercase">
          Or upload new files
        </h3>
        <UploadZone
          onFile={upload}
          disabled={uploadState.status === 'processing'}
        />
        <DocumentCard {...uploadState} onClear={reset} onRetry={retry} />
      </section>

      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onClose} className={DIALOG_SECONDARY}>
          {selected.length === 0 ? 'Done' : 'Cancel'}
        </button>
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || selected.length === 0}
          className={DIALOG_PRIMARY}
        >
          {selected.length === 0
            ? 'Add sources'
            : `Add ${sources(selected.length)}`}
        </button>
      </div>
    </Dialog>
  )
}
