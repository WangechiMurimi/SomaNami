import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../features/auth/auth-context.ts'
import { TEXT_LINK } from '../features/auth/auth-ui.ts'
import { detailsPathFor } from '../features/auth/safe-next.ts'
import { getProfile } from '../lib/auth/profile.ts'
import SessionsSection from './account/SessionsSection.tsx'
import { H1, H2, LEDE } from './page-heading.ts'

/** The signed-in user's account: name, email and sign-out. */
export default function AccountPage() {
  const { status, user } = useAuth()
  const userId = user?.id ?? null
  const online = status === 'signed-in'
  const [loaded, setLoaded] = useState<{
    userId: string
    name: string | null
  }>()

  useEffect(() => {
    if (!online || userId === null) return
    let active = true
    getProfile(userId)
      .catch(() => null)
      .then((profile) => {
        if (active) setLoaded({ userId, name: profile?.displayName ?? null })
      })
    return () => {
      active = false
    }
  }, [online, userId])

  // The name lives in the cloud profile, so offline there is nothing to show.
  const nameText = !online
    ? 'Connect to the internet to see your name.'
    : loaded?.userId !== userId
      ? 'Loading…'
      : (loaded.name ?? 'We couldn’t load your name.')

  return (
    <div className="flex max-w-3xl flex-col gap-14">
      <div>
        <h1 className={H1}>Account</h1>
        <p className={LEDE}>Manage how you sign in to SomaNami.</p>
      </div>
      <section aria-labelledby="account-name">
        <h2 id="account-name" className={H2}>
          Name
        </h2>
        <p className="mt-3 text-[15px] font-medium break-words text-fg">
          {nameText}
        </p>
        {online && (
          <p className="mt-2 text-[15px]">
            <Link to={detailsPathFor('/account')} className={TEXT_LINK}>
              Change your name
            </Link>
          </p>
        )}
      </section>
      <section aria-labelledby="account-email">
        <h2 id="account-email" className={H2}>
          Email
        </h2>
        <p className="mt-3 text-[15px] font-medium break-all text-fg">
          {user?.email}
        </p>
      </section>
      <SessionsSection />
    </div>
  )
}
