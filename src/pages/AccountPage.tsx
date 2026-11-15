import { useAuth } from '../features/auth/auth-context.ts'
import MfaSection from './account/MfaSection.tsx'
import SessionsSection from './account/SessionsSection.tsx'
import { H1, H2, LEDE } from './page-heading.ts'

/** The signed-in user's account: email, two-step verification and sign-out. */
export default function AccountPage() {
  const { user } = useAuth()
  return (
    <div className="flex max-w-3xl flex-col gap-14">
      <div>
        <h1 className={H1}>Account</h1>
        <p className={LEDE}>Manage how you sign in to SomaNami.</p>
      </div>
      <section aria-labelledby="account-email">
        <h2 id="account-email" className={H2}>
          Email
        </h2>
        <p className="mt-3 text-[15px] font-medium break-all text-fg">
          {user?.email}
        </p>
      </section>
      <MfaSection />
      <SessionsSection />
    </div>
  )
}
