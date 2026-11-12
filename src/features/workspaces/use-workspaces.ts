import { useEffect, useState } from 'react'
import {
  listWorkspaces,
  subscribeToWorkspaces,
} from '../../lib/storage/index.ts'
import type { Workspace } from '../../types/contracts.ts'

export type WorkspacesStatus = 'loading' | 'ready' | 'error'

/**
 * Every workspace on this device, most recently updated first. Reloads when
 * one is created, renamed or removed anywhere in the app.
 */
export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [status, setStatus] = useState<WorkspacesStatus>('loading')

  useEffect(() => {
    let cancelled = false
    const load = () =>
      listWorkspaces()
        .then((stored) => {
          if (cancelled) return
          setWorkspaces(stored)
          setStatus('ready')
        })
        .catch((error: unknown) => {
          if (cancelled) return
          console.error('Could not load workspaces', error)
          setStatus('error')
        })

    void load()
    const unsubscribe = subscribeToWorkspaces(() => void load())
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return { workspaces, status }
}
