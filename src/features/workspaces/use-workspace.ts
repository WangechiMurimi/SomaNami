import { useEffect, useState } from 'react'
import { getWorkspace, subscribeToWorkspaces } from '../../lib/storage/index.ts'
import type { Workspace } from '../../types/contracts.ts'

export type WorkspaceState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; workspace: Workspace }

/** One workspace by id, kept current if it is renamed or removed. */
export function useWorkspace(workspaceId: string): WorkspaceState {
  const [state, setState] = useState<WorkspaceState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    const load = () =>
      getWorkspace(workspaceId).then(
        (workspace) => {
          if (cancelled) return
          setState(
            workspace ? { status: 'ready', workspace } : { status: 'missing' },
          )
        },
        (error: unknown) => {
          if (cancelled) return
          console.error('Could not open the workspace', error)
          setState({ status: 'missing' })
        },
      )
    void load()
    const unsubscribe = subscribeToWorkspaces(() => void load())
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [workspaceId])

  return state
}
