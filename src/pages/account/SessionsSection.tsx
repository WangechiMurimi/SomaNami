import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import ConfirmDialog from '../../components/ConfirmDialog.tsx'
import { useAuth } from '../../features/auth/auth-context.ts'
import { useOnline } from '../../lib/connectivity/use-online.ts'
import { openUserStore, removeUserStore } from '../../lib/storage/index.ts'
import { H2 } from '../page-heading.ts'

const BUTTON =
  'inline-flex min-h-11 flex-none items-center justify-center rounded-[10px] border px-[18px] py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60'
const SECONDARY = `${BUTTON} border-edge text-fg hover:bg-tint`
const DESTRUCTIVE = `${BUTTON} border-warn text-warn hover:bg-warn-soft`

function Row({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action: ReactNode
}) {
  return (
    <li className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div>
        <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
        <p className="mt-1 text-sm leading-[1.6] text-muted">{children}</p>
      </div>
      {action}
    </li>
  )
}

/**
 * "Sign out" section of the Account page: this device, every device, and
 * sign out after removing this user's materials from this device.
 */
export default function SessionsSection() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [removeFailed, setRemoveFailed] = useState(false)

  async function finish(scope: 'local' | 'global') {
    setBusy(true)
    await signOut({ scope })
    navigate('/sign-in', { replace: true })
  }

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
    await finish('local')
  }

  function closeDialog() {
    if (busy) return
    setConfirming(false)
    setRemoveFailed(false)
  }

  return (
    <section aria-labelledby="account-sessions">
      <h2 id="account-sessions" className={H2}>
        Sign out
      </h2>
      <ul className="mt-5 divide-y divide-line rounded-xl border border-line bg-surface p-5 md:p-6">
        <Row
          title="This device"
          action={
            <button
              type="button"
              disabled={busy}
              onClick={() => void finish('local')}
              className={SECONDARY}
            >
              Sign out
            </button>
          }
        >
          Your materials stay saved to your account on this device for the next
          time you sign in.
        </Row>
        <Row
          title="Every device"
          action={
            <button
              type="button"
              // Offline, the other devices can't be reached, and Supabase would
              // quietly sign out only this one.
              disabled={busy || !online}
              onClick={() => void finish('global')}
              className={SECONDARY}
            >
              Sign out of all devices
            </button>
          }
        >
          For a device you no longer use or have lost. Other devices sign out
          the next time they’re online.
          {!online && ' Connect to the internet to use this.'}
        </Row>
        <Row
          title="A shared computer"
          action={
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(true)}
              className={DESTRUCTIVE}
            >
              Sign out and remove my materials from this device
            </button>
          }
        >
          Deletes your materials and chats from this device before signing out,
          so the next person can’t open them.
        </Row>
      </ul>

      {confirming && (
        <ConfirmDialog
          title="Remove your materials from this device?"
          confirmLabel="Remove and sign out"
          busy={busy}
          onConfirm={() => void removeAndSignOut()}
          onCancel={closeDialog}
        >
          <p>
            Your materials and chats will be deleted from this device. They
            aren’t saved anywhere else yet, so this can’t be undone.
          </p>
          {removeFailed && (
            <p role="alert" className="mt-2 text-warn">
              We couldn’t remove them, so you’re still signed in. Try again.
            </p>
          )}
        </ConfirmDialog>
      )}
    </section>
  )
}
