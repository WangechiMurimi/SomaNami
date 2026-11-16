import { useState } from 'react'
import { DEFAULT_WORKSPACE } from '../../lib/storage/index.ts'
import type { Workspace } from '../../types/contracts.ts'
import { KIND_LABEL } from '../library/kind-label.ts'
import { useLibraryContext } from '../library/library-context.ts'
import Dialog, {
  DIALOG_PRIMARY,
  DIALOG_SECONDARY,
} from '../../components/Dialog.tsx'
import SourceChecklist from './SourceChecklist.tsx'

const sources = (n: number) => `${n} ${n === 1 ? 'source' : 'sources'}`

/**
 * Takes sources out of a workspace. They move back to My library rather than
 * being deleted, and the workspace's chats stop using them.
 */
export default function RemoveSourcesDialog({
  workspace,
  onClose,
}: {
  workspace: Workspace
  onClose: () => void
}) {
  const { documents, move } = useLibraryContext()
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const materials = documents.filter(
    ({ workspaceId }) => workspaceId === workspace.id,
  )

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((other) => other !== id)
        : [...current, id],
    )

  const removeSelected = async () => {
    setBusy(true)
    setError(null)
    try {
      for (const id of selected) await move(id, DEFAULT_WORKSPACE.id)
      onClose()
    } catch (cause) {
      console.error('Could not remove the sources', cause)
      setError('We couldn’t remove every source. Try again.')
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={`Remove sources from ${workspace.name}`}
      description="Removed files stay in My library. Chats in this workspace stop using them."
      onClose={onClose}
    >
      {materials.length > 0 ? (
        <SourceChecklist
          legend="In this workspace"
          materials={materials}
          selected={selected}
          onToggle={toggle}
          detail={({ kind }) => KIND_LABEL[kind]}
        />
      ) : (
        <p className="text-sm text-muted">This workspace has no sources yet.</p>
      )}

      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onClose} className={DIALOG_SECONDARY}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void removeSelected()}
          disabled={busy || selected.length === 0}
          className={DIALOG_PRIMARY}
        >
          {selected.length === 0
            ? 'Remove sources'
            : `Remove ${sources(selected.length)}`}
        </button>
      </div>
    </Dialog>
  )
}
