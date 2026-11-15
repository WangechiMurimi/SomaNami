import { useState } from 'react'
import ConfirmDialog from '../../components/ConfirmDialog.tsx'
import type { Workspace } from '../../types/contracts.ts'
import { useLibraryContext } from '../library/library-context.ts'
import AddSourcesDialog from './AddSourcesDialog.tsx'
import RemoveSourcesDialog from './RemoveSourcesDialog.tsx'
import RenameWorkspaceDialog from './RenameWorkspaceDialog.tsx'
import type { WorkspaceAction } from './WorkspaceMenu.tsx'

/** Workspace actions that open a dialog rather than acting straight away. */
export type DialogAction = Extract<
  WorkspaceAction,
  'add-sources' | 'remove-sources' | 'rename' | 'delete'
>

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

/** Asks before deleting, and says plainly what goes with the workspace. */
function DeleteWorkspaceDialog({
  workspace,
  chats,
  onClose,
  onDeleted,
}: {
  workspace: Workspace
  chats: number
  onClose: () => void
  onDeleted?: () => void
}) {
  const { documents, removeWorkspace } = useLibraryContext()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const materials = documents.filter(
    ({ workspaceId }) => workspaceId === workspace.id,
  ).length

  const confirm = async () => {
    setBusy(true)
    try {
      await removeWorkspace(workspace.id)
      onClose()
      onDeleted?.()
    } catch (cause) {
      console.error('Could not delete the workspace', cause)
      setError('We couldn’t delete it. Try again.')
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      title={`Delete ${workspace.name}?`}
      confirmLabel="Delete workspace"
      busy={busy}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      <p>
        This deletes the workspace, its {count(chats, 'chat', 'chats')} and its{' '}
        {count(materials, 'material', 'materials')}. You can’t undo this.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-warn">
          {error}
        </p>
      )}
    </ConfirmDialog>
  )
}

/** The dialog for one workspace action, shared by the list and the workspace. */
export default function WorkspaceActionDialog({
  action,
  workspace,
  chats,
  onClose,
  onDeleted,
}: {
  action: DialogAction
  workspace: Workspace
  chats: number
  onClose: () => void
  onDeleted?: () => void
}) {
  switch (action) {
    case 'add-sources':
      return <AddSourcesDialog workspace={workspace} onClose={onClose} />
    case 'remove-sources':
      return <RemoveSourcesDialog workspace={workspace} onClose={onClose} />
    case 'rename':
      return <RenameWorkspaceDialog workspace={workspace} onClose={onClose} />
    case 'delete':
      return (
        <DeleteWorkspaceDialog
          workspace={workspace}
          chats={chats}
          onClose={onClose}
          onDeleted={onDeleted}
        />
      )
  }
}
