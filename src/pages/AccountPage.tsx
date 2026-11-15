import { useBreadcrumbs } from '../app/breadcrumbs.ts'
import { initialsFor } from '../app/initials.ts'
import ThemePicker from '../components/ThemePicker.tsx'
import { useAuth } from '../features/auth/auth-context.ts'
import { CARD, CARD_TITLE } from './account/account-ui.ts'
import MfaSection from './account/MfaSection.tsx'
import PrivacySection from './account/PrivacySection.tsx'
import SessionsSection from './account/SessionsSection.tsx'
import { H1, LEDE } from './page-heading.ts'

/** Account settings: profile, theme, data, sign-out and 2FA. */
export default function AccountPage() {
  const { user } = useAuth()
  const email = user?.email ?? ''
  useBreadcrumbs([{ label: 'Account settings' }])

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className={H1}>Account settings</h1>
        <p className={LEDE}>
          Manage your profile, how SomaNami looks, how you sign in, and your
          materials.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* TODO(#143): name and photo editing arrive with the profiles table. */}
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
              <dt className="text-[15px] leading-[1.5] font-semibold text-fg">
                Email
              </dt>
              <dd className="text-[15px] leading-[1.5] break-all text-muted">
                {email}
              </dd>
            </dl>
          </div>
        </section>

        <section aria-labelledby="account-appearance" className={CARD}>
          <h2 id="account-appearance" className={CARD_TITLE}>
            Appearance
          </h2>
          <ThemePicker />
        </section>

        <PrivacySection />
        <SessionsSection />
        <MfaSection />
      </div>
    </div>
  )
}
