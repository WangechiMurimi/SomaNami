import { useState } from 'react'
import { useNavigate } from 'react-router'
import ConfirmDialog from '../../components/ConfirmDialog.tsx'
import { useAuth } from '../../features/auth/auth-context.ts'
import { openUserStore, removeUserStore } from '../../lib/storage/index.ts'
import { DESTRUCTIVE } from './account-ui.ts'

/**
 * Deletes this user's materials and chats from this browser, then signs out.
 * Signing out afterwards keeps the app from reopening an empty store.
 */
export default function RemoveFromDevice() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [removeFailed, setRemoveFailed] = useState(false)

  async function removeAndSignOut() {
    if (!user) return
    setBusy(true)
    setRemoveFailed(false)
    try {
      await removeUserStore(user.id)
    } catch {
      // Signing out now would leave the materials behind while the person
      // believes they're gone, so stay here and let them try again. The
      // removal closed the store first; reopen it so the app keeps working.
      await openUserStore(user.id).catch(() => {})
      setRemoveFailed(true)
      setBusy(false)
      return
    }
    await signOut({ scope: 'local' })
    navigate('/sign-in', { replace: true })
  }

  function closeDialog() {
    if (busy) return
    setConfirming(false)
    setRemoveFailed(false)
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <div>
        <h3 className="text-[15px] font-semibold text-fg">
          Remove your materials
        </h3>
        <p className="mt-1 text-sm leading-[1.55] text-muted">
          Deletes the materials and chats saved in this browser, then signs you
          out.
        </p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => setConfirming(true)}
        className={DESTRUCTIVE}
      >
        Remove my materials and sign out
      </button>

      {confirming && (
        <ConfirmDialog
          title="Remove your materials?"
          confirmLabel="Remove and sign out"
          busy={busy}
          onConfirm={() => void removeAndSignOut()}
          onCancel={closeDialog}
        >
          <p>
            Your materials and chats will be deleted from this browser. This
            can’t be undone.
          </p>
          {removeFailed && (
            <p role="alert" className="mt-2 text-warn">
              We couldn’t remove them, so you’re still signed in. Try again.
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  )
}
