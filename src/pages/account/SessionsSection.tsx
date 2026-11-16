import { useState } from 'react'
import type { ReactNode } from 'react'
import ConfirmDialog from '../../components/ConfirmDialog.tsx'
import {
  LEAVE_MESSAGES,
  OTHER_TABS_MESSAGE,
  useLeaveDevice,
} from '../../features/sync/use-leave-device.ts'
import { useOnline } from '../../lib/connectivity/use-online.ts'
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
 * "Sign out" section of the Account page (#147): sign out of this device or
 * every device, each saving changes first and then clearing this device; or
 * erase everything stored in SomaNami.
 */
export default function SessionsSection() {
  const online = useOnline()
  const { leave, erase, busy, problem, waitingForTabs, reset } =
    useLeaveDevice()
  const [confirmingErase, setConfirmingErase] = useState(false)
  const erasing = problem === 'erase-failed' || problem === 'erase-offline'

  function closeDialog() {
    if (busy) return
    setConfirmingErase(false)
    reset()
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
              onClick={() => void leave('local')}
              className={SECONDARY}
            >
              Sign out
            </button>
          }
        >
          Saves your changes to your account, then removes your materials from
          this device. They come back the next time you sign in.
        </Row>
        <Row
          title="Every device"
          action={
            <button
              type="button"
              // Offline, the other devices can't be reached, and Supabase would
              // quietly sign out only this one.
              disabled={busy || !online}
              onClick={() => void leave('global')}
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
          title="Your materials"
          action={
            <button
              type="button"
              disabled={busy || !online}
              onClick={() => setConfirmingErase(true)}
              className={DESTRUCTIVE}
            >
              Erase my materials
            </button>
          }
        >
          Deletes every material, chat and uploaded file from your SomaNami
          account and from all your devices, then signs you out.
          {!online && ' Connect to the internet to use this.'}
        </Row>
      </ul>

      {!confirmingErase && problem && !erasing && (
        <p role="alert" className="mt-3 text-sm text-warn">
          {LEAVE_MESSAGES[problem]}
        </p>
      )}
      {!confirmingErase && waitingForTabs && (
        <p role="status" className="mt-3 text-sm text-muted">
          {OTHER_TABS_MESSAGE}
        </p>
      )}

      {confirmingErase && (
        <ConfirmDialog
          title="Erase all your materials?"
          confirmLabel="Erase everything"
          busy={busy}
          onConfirm={() => void erase()}
          onCancel={closeDialog}
        >
          <p>
            Every material, chat and uploaded file in your SomaNami account will
            be deleted, on every device. This can’t be undone. You’ll be signed
            out afterwards.
          </p>
          {problem && (
            <p role="alert" className="mt-2 text-warn">
              {LEAVE_MESSAGES[problem]}
            </p>
          )}
          {waitingForTabs && (
            <p role="status" className="mt-2 text-muted">
              {OTHER_TABS_MESSAGE}
            </p>
          )}
        </ConfirmDialog>
      )}
    </section>
  )
}
