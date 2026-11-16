import type { ReactNode } from 'react'
import AuthLayout from '../features/auth/AuthLayout.tsx'
import Confirm from '../features/auth/OwnerToConfirm.tsx'

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

/**
 * How SomaNami handles learners' data, in plain language. It states only what
 * the code does; anything the owner hasn't confirmed shows as a visible
 * [CONFIRM: …] placeholder. Public route.
 */
export default function DataHandlingPage() {
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
            Your account: your email address, the name you want SomaNami to call
            you, and your answer to “I’m 13 or older”. Sign-in is handled by
            Supabase, with an email and password or with Google. Your password
            goes only to Supabase; we never see it.
          </li>
          <li>
            The materials you add (files, pasted text and web pages added by
            link), the passages made from them, and your chats.
          </li>
          <li>
            The sign-in and sign-up forms use Cloudflare Turnstile to check
            you’re a person. It looks at signals from your browser for that
            check only.
          </li>
        </Section>

        <Section title="Where it’s stored">
          <li>
            Your materials, their passages and your chats are saved to your
            SomaNami account, and the browser keeps a working copy while you’re
            signed in.
          </li>
          <li>
            The original files you upload are kept in file storage that only
            your account can read.
          </li>
          <li>
            <Confirm>
              where the account data is hosted (region), and how long it’s kept.
            </Confirm>
          </li>
        </Section>

        <Section title="How answers are made">
          <li>
            When you add a file, your browser reads it and splits it into
            passages. When you add a link, SomaNami’s server fetches that one
            page and keeps its readable text.
          </li>
          <li>
            When you ask a question, your question, the earlier messages in that
            chat and the list of materials the chat uses are sent to SomaNami’s
            server. The server picks the best-matching passages from those
            materials in your account and uses only them to write the answer.
          </li>
          <li>
            <Confirm>
              which model writes answers, where it runs, and whether questions
              or passages are kept or used for training.
            </Confirm>
          </li>
        </Section>

        <Section title="Removing your data">
          <li>
            Delete any material from My library. It’s removed from your account,
            original file included.
          </li>
          <li>
            In Account settings, “Erase my materials” deletes every material,
            chat and uploaded file from your account, then signs you out.
          </li>
          <li>
            <Confirm>
              how to delete your account itself, and how long it takes.
            </Confirm>
          </li>
        </Section>

        <p className="text-[15px] leading-[1.6] text-muted">
          Questions? <Confirm>how learners reach you.</Confirm>
        </p>
      </div>
    </AuthLayout>
  )
}
