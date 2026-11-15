import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../features/auth/auth-context.ts'
import { CARD, CARD_TITLE, SECONDARY } from './account-ui.ts'

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
    <li className="flex flex-col items-start gap-3 py-[18px] first:pt-0 last:pb-0">
      <div>
        <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
        <p className="mt-1 text-sm leading-[1.55] text-muted">{children}</p>
      </div>
      {action}
    </li>
  )
}

/**
 * "Sign out" card of Account settings: this device, or every device.
 * Signing out after removing materials lives under Privacy and data.
 */
export default function SessionsSection() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  async function finish(scope: 'local' | 'global') {
    setBusy(true)
    await signOut({ scope })
    navigate('/sign-in', { replace: true })
  }

  return (
    <section aria-labelledby="account-sessions" className={CARD}>
      <h2 id="account-sessions" className={CARD_TITLE}>
        Sign out
      </h2>
      {user?.email && (
        <p className="text-sm leading-[1.55] break-all text-muted">
          Signed in as {user.email}.
        </p>
      )}
      <ul className="divide-y divide-line">
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
          Your materials and chats are kept for the next time you sign in.
        </Row>
        <Row
          title="Every device"
          action={
            <button
              type="button"
              disabled={busy}
              onClick={() => void finish('global')}
              className={SECONDARY}
            >
              Sign out of all devices
            </button>
          }
        >
          For a device you no longer use or have lost. Other devices are signed
          out the next time they use SomaNami.
        </Row>
      </ul>
    </section>
  )
}
