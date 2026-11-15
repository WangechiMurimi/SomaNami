import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { updateWorkspace } from '../../lib/storage/index.ts'
import type { Workspace } from '../../types/contracts.ts'
import Dialog, { DIALOG_PRIMARY, DIALOG_SECONDARY } from './Dialog.tsx'

/** Renames a workspace; an empty name is refused rather than saved. */
export default function RenameWorkspaceDialog({
  workspace,
  onClose,
}: {
  workspace: Workspace
  onClose: () => void
}) {
  const id = useId()
  const [name, setName] = useState(workspace.name)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('Give your workspace a name.')
      return
    }
    setBusy(true)
    try {
      await updateWorkspace(workspace.id, { name })
      onClose()
    } catch (cause) {
      console.error('Could not rename the workspace', cause)
      setError('We couldn’t rename it. Try again.')
      setBusy(false)
    }
  }

  return (
    <Dialog title={`Rename ${workspace.name}`} onClose={onClose}>
      <form
        onSubmit={(event) => void save(event)}
        noValidate
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-name`} className="text-sm font-medium">
            Workspace name
          </label>
          <input
            id={`${id}-name`}
            type="text"
            value={name}
            required
            data-autofocus
            onChange={(event) => {
              setName(event.target.value)
              if (error) setError(null)
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className="h-12 w-full rounded-[10px] border border-edge bg-surface px-3.5 text-base text-fg"
          />
          {error && (
            <p id={`${id}-error`} className="text-sm text-warn">
              {error}
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className={DIALOG_SECONDARY}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={DIALOG_PRIMARY}>
            Save
          </button>
        </div>
      </form>
    </Dialog>
  )
}
