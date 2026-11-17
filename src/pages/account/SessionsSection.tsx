import { useState } from 'react'
import type { ReactNode } from 'react'
import ConfirmDialog from '../../components/ConfirmDialog.tsx'
import {
  LEAVE_MESSAGES,
  OTHER_TABS_MESSAGE,
  useLeaveDevice,
} from '../../features/sync/use-leave-device.ts'
import { useOnline } from '../../lib/connectivity/use-online.ts'
import { CARD, CARD_TITLE, DESTRUCTIVE, SECONDARY } from './account-ui.ts'

// Shown beside a disabled action, so the reason is never missing.
const UNREACHABLE =
  ' We can’t reach SomaNami right now, so this is unavailable.'

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
        <h3 className="text-[0.9375rem] font-semibold text-fg">{title}</h3>
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
    <section aria-labelledby="account-sessions" className={CARD}>
      <h2 id="account-sessions" className={CARD_TITLE}>
        Sign out
      </h2>
      <ul className="divide-y divide-line">
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
          Your materials and chats are kept for the next time you sign in.
        </Row>
        <Row
          title="Every device"
          action={
            <button
              type="button"
              // Unreachable, the other devices can't be signed out, and
              // Supabase would quietly sign out only this one.
              disabled={busy || !online}
              onClick={() => void leave('global')}
              className={SECONDARY}
            >
              Sign out of all devices
            </button>
          }
        >
          For a device you no longer use or have lost. Other devices are signed
          out the next time they use SomaNami.
          {!online && UNREACHABLE}
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
          {!online && UNREACHABLE}
        </Row>
      </ul>

      {!confirmingErase && problem && !erasing && (
        <p role="alert" className="text-sm text-warn">
          {LEAVE_MESSAGES[problem]}
        </p>
      )}
      {!confirmingErase && waitingForTabs && (
        <p role="status" className="text-sm text-muted">
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
