import { Link } from 'react-router'
import AuthLayout from '../features/auth/AuthLayout.tsx'
import LegalSection from '../features/auth/LegalSection.tsx'
import { TEXT_LINK } from '../features/auth/auth-ui.ts'

/** Plain-language Privacy Notice for learners aged 13 and up. Public route. */
export default function PrivacyPage() {
  return (
    <AuthLayout
      wide
      title="Privacy Notice"
      lede="What SomaNami keeps about you, where it lives, and how to delete it. Last updated November 2026."
    >
      <LegalSection title="The short version">
        <ul className="flex flex-col gap-2">
          <li>
            Your documents and chats stay <strong>on this device</strong>. We
            don’t upload them to our servers.
          </li>
          <li>
            When you ask a question, we send <strong>your question</strong>, the
            earlier messages in that chat, and the parts of your materials that
            match it, so the AI can answer.
          </li>
          <li>
            Your account holds your email and a scrambled (hashed) password. We
            never see your password and we don’t keep your birth date.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Your account">
        <p>
          To make an account we store your <strong>email address</strong>, your
          password in a form no one can read back (not even us), a note that you
          said you’re <strong>13 or older</strong>, and the time you agreed to
          these terms. We ask for your birth month and year once to check your
          age, then throw them away.
        </p>
        <p>
          Accounts are run by Supabase, the service that signs you in. It keeps
          you signed in on this device so you don’t have to type your password
          every time.
        </p>
      </LegalSection>

      <LegalSection title="Your materials stay on this device">
        <p>
          The documents you add, and your conversations about them, are saved in
          this browser, in a space that belongs to your account. Someone else
          signing in on the same computer can’t see them in SomaNami. They
          aren’t copied to our servers, so a new device starts empty.
        </p>
        <p>
          Anyone who can use your computer’s browser profile could still dig
          into its saved data, so sign out on shared computers.
        </p>
      </LegalSection>

      <LegalSection title="What goes to the AI">
        <p>
          Answers are written by Claude, an AI made by Anthropic. When you ask a
          question, your browser picks the passages from your materials that
          best match it. We send <strong>your question</strong>, the{' '}
          <strong>earlier messages in that chat</strong>, and{' '}
          <strong>those passages</strong> through our server to Anthropic. Our
          server doesn’t save them. Your whole document is never sent.
        </p>
      </LegalSection>

      <LegalSection title="Keeping bots out">
        <p>
          The sign-in and sign-up forms use Cloudflare Turnstile to check you’re
          a person. It looks at signals from your browser for that check only.
        </p>
      </LegalSection>

      <LegalSection title="Deleting your information">
        <ul className="flex flex-col gap-2">
          <li>
            <strong>Your materials:</strong> on your Account page, choose to
            sign out and remove your materials from this device. Clearing this
            site’s data in your browser settings removes them too.
          </li>
          <li>
            <strong>Your account:</strong> ask the SomaNami team to delete it,
            and we’ll remove your email and sign-in details.
          </li>
        </ul>
      </LegalSection>

      <p className="mt-12 text-[15px] text-muted">
        See also our{' '}
        <Link to="/terms" className={TEXT_LINK}>
          Terms
        </Link>
        .
      </p>
    </AuthLayout>
  )
}
