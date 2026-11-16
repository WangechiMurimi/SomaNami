import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useBreadcrumbs } from '../app/breadcrumbs.ts'
import { initialsFor } from '../app/initials.ts'
import ThemePicker from '../components/ThemePicker.tsx'
import { useAuth } from '../features/auth/auth-context.ts'
import { TEXT_LINK } from '../features/auth/auth-ui.ts'
import { detailsPathFor } from '../features/auth/safe-next.ts'
import { getProfile } from '../lib/auth/profile.ts'
import { CARD, CARD_TITLE } from './account/account-ui.ts'
import SessionsSection from './account/SessionsSection.tsx'
import { H1, LEDE } from './page-heading.ts'

/** Account settings: profile, theme, sign-out and erasing materials. */
export default function AccountPage() {
  const { status, user } = useAuth()
  const email = user?.email ?? ''
  const userId = user?.id ?? null
  const online = status === 'signed-in'
  const [loaded, setLoaded] = useState<{
    userId: string
    name: string | null
  }>()
  useBreadcrumbs([{ label: 'Account settings' }])

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

  // The name lives in the cloud profile; without a fresh session it can't load.
  const nameText = !online
    ? 'We couldn’t load your name.'
    : loaded?.userId !== userId
      ? 'Loading…'
      : (loaded.name ?? 'We couldn’t load your name.')

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className={H1}>Account settings</h1>
        <p className={LEDE}>
          Manage your profile, how SomaNami looks, and how you sign in.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="account-profile" className={CARD}>
          <h2 id="account-profile" className={CARD_TITLE}>
            Profile
          </h2>
          <div className="flex min-w-0 items-center gap-4">
            <span
              aria-hidden="true"
              className="flex size-14 flex-none items-center justify-center rounded-full bg-tint text-lg font-semibold text-accent"
            >
              {initialsFor(email)}
            </span>
            <dl className="min-w-0">
              <dt className="sr-only">Name</dt>
              <dd className="text-[15px] leading-[1.5] font-semibold break-words text-fg">
                {nameText}
              </dd>
              <dt className="sr-only">Email</dt>
              <dd className="text-[15px] leading-[1.5] break-all text-muted">
                {email}
              </dd>
            </dl>
          </div>
          {online && (
            <p className="text-[15px]">
              <Link to={detailsPathFor('/account')} className={TEXT_LINK}>
                Change your name
              </Link>
            </p>
          )}
        </section>

        <section aria-labelledby="account-appearance" className={CARD}>
          <h2 id="account-appearance" className={CARD_TITLE}>
            Appearance
          </h2>
          <ThemePicker />
        </section>
      </div>

      <SessionsSection />
    </div>
  )
}
