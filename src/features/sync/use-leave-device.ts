import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  listOutbox,
  openUserStore,
  removeUserStore,
} from '../../lib/storage/index.ts'
import { useAuth } from '../auth/auth-context.ts'
import { noteSigningOut } from '../auth/sign-out-intent.ts'
import { SyncFlushError, useSync } from './sync-context.ts'

/** Why leaving stopped, so the learner is never told it worked when it didn't. */
export type LeaveProblem =
  | 'unsaved-offline'
  | 'unsaved-failed'
  | 'erase-offline'
  | 'erase-failed'
  | 'clear-failed'

/** What each problem says; every one keeps the learner signed in. */
export const LEAVE_MESSAGES: Record<LeaveProblem, string> = {
  'unsaved-offline':
    'You have changes that haven’t saved yet. Connect to the internet to finish.',
  'unsaved-failed':
    'We couldn’t save your latest changes, so you’re still signed in. Try again.',
  'erase-offline': 'Connect to the internet to erase your materials.',
  'erase-failed':
    'We couldn’t erase your materials, so nothing was removed and you’re still signed in. Try again.',
  'clear-failed':
    'We couldn’t clear this device, so you’re still signed in. Try again.',
}

/** Shown while the device copy waits for another tab to let go of it. */
export const OTHER_TABS_MESSAGE = 'Close SomaNami in your other tabs to finish.'

/**
 * Signing out and erasing (#147). Signing out saves every change to the cloud
 * first, then clears this device's copy, then signs out; erasing deletes
 * everything in the cloud first instead of saving it. Each step must succeed
 * before the next starts, so a failure leaves the learner signed in with
 * their materials where they were, and says why.
 */
export function useLeaveDevice() {
  const { user, signOut } = useAuth()
  const { flush, eraseCloud } = useSync()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<LeaveProblem | null>(null)
  const [waitingForTabs, setWaitingForTabs] = useState(false)

  const stop = useCallback((reason: LeaveProblem) => {
    setProblem(reason)
    setWaitingForTabs(false)
    setBusy(false)
  }, [])

  /** Clears the device copy and signs out; false (and a problem) on failure. */
  const clearAndSignOut = useCallback(
    async (scope: 'local' | 'global') => {
      if (!user) return
      try {
        await removeUserStore(user.id, {
          onBlocked: () => setWaitingForTabs(true),
        })
      } catch {
        // The removal closed the store first; reopen it so the app keeps
        // working while the learner tries again.
        await openUserStore(user.id).catch(() => {})
        stop('clear-failed')
        return
      }
      noteSigningOut()
      await signOut({ scope })
      navigate('/sign-in', { replace: true })
    },
    [user, signOut, navigate, stop],
  )

  const leave = useCallback(
    async (scope: 'local' | 'global' = 'local') => {
      setBusy(true)
      setProblem(null)
      try {
        await flush()
      } catch (error) {
        const offline =
          error instanceof SyncFlushError && error.reason === 'offline'
        // Offline with nothing waiting, there's nothing to lose.
        const unsaved = (await listOutbox().catch(() => [1])).length > 0
        if (unsaved) return stop(offline ? 'unsaved-offline' : 'unsaved-failed')
      }
      await clearAndSignOut(scope)
    },
    [flush, clearAndSignOut, stop],
  )

  const erase = useCallback(async () => {
    setBusy(true)
    setProblem(null)
    try {
      await eraseCloud()
    } catch (error) {
      const offline =
        error instanceof SyncFlushError && error.reason === 'offline'
      return stop(offline ? 'erase-offline' : 'erase-failed')
    }
    await clearAndSignOut('local')
  }, [eraseCloud, clearAndSignOut, stop])

  const reset = useCallback(() => setProblem(null), [])

  return { leave, erase, busy, problem, waitingForTabs, reset }
}
