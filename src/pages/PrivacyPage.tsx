import type { ReactNode } from 'react'
import { Link } from 'react-router'
import AuthLayout from '../features/auth/AuthLayout.tsx'
import { TEXT_LINK } from '../features/auth/auth-ui.ts'

/**
 * Wording the owner has not confirmed yet. Kept visible on purpose, so the
 * page can't ship looking finished while it still guesses.
 */
function Confirm({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded bg-warn-soft px-1 text-warn">
      [CONFIRM: {children}]
    </mark>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-7">
      <h2 className="text-xl leading-[1.3] font-medium">{title}</h2>
      <ul className="ml-5 flex list-disc flex-col gap-2 text-[15px] leading-[1.6] text-fg">
        {children}
      </ul>
    </section>
  )
}

/** How SomaNami handles learners' data, in plain language. Public route. */
export default function PrivacyPage() {
  return (
    <AuthLayout
      wide
      title="How your data is handled"
      lede="What SomaNami keeps, what happens when you ask a question, and how to remove your data. Answers come only from the materials you add."
    >
      <div className="flex flex-col gap-8">
        <p className="text-[13px] leading-[1.5] text-muted">
          Last updated <Confirm>date</Confirm>
        </p>

        <Section title="What we keep">
          <li>
            Your account: your email address and when you agreed to the Terms.
            Sign-in is handled by Supabase. Your password goes only to them; we
            never see it.
          </li>
          <li>
            The materials you add, the passages made from them, and your chats.
          </li>
          <li>
            The sign-in and sign-up forms use Cloudflare Turnstile to check
            you’re a person. It looks at signals from your browser for that
            check only.
          </li>
        </Section>

        <Section title="Where it’s stored">
          <li>
            <Confirm>
              where materials and chats are stored, and for how long. Today the
              app saves them in the browser, under the signed-in account.
            </Confirm>
          </li>
        </Section>

        <Section title="How answers are made">
          <li>
            When you add a file, your browser reads it and splits it into
            passages.
          </li>
          <li>
            When you ask a question, your browser picks the passages that best
            match it. Your question, the earlier messages in that chat and those
            passages are sent to SomaNami’s server to produce an answer. The
            whole file isn’t sent.
          </li>
          <li>
            <Confirm>
              which model writes answers, where it runs, and whether questions
              or passages are kept or used for training.
            </Confirm>
          </li>
        </Section>

        <Section title="Removing your data">
          <li>Remove any material from My library.</li>
          <li>
            In Account settings, “Remove my materials and sign out” deletes all
            your materials and chats from that browser.
          </li>
          <li>
            <Confirm>
              how to delete your account, and how long it takes.
            </Confirm>
          </li>
        </Section>

        <p className="text-[15px] leading-[1.6] text-muted">
          Questions? <Confirm>how learners reach you.</Confirm> See also our{' '}
          <Link to="/terms" className={TEXT_LINK}>
            Terms
          </Link>
          .
        </p>
      </div>
    </AuthLayout>
  )
}
