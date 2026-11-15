import { Link } from 'react-router'
import AuthLayout from '../features/auth/AuthLayout.tsx'
import LegalSection from '../features/auth/LegalSection.tsx'
import { TEXT_LINK } from '../features/auth/auth-ui.ts'

/** Plain-language Terms for learners aged 13 and up. Public route. */
export default function TermsPage() {
  return (
    <AuthLayout
      wide
      title="Terms"
      lede="The ground rules for using SomaNami. Last updated November 2026."
    >
      <LegalSection title="Who can use SomaNami">
        <p>
          You need to be <strong>13 or older</strong> to make an account. If
          you’re under 18, check with a parent, guardian or teacher that it’s
          okay for you to use it.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <p>
          Keep your password to yourself, and sign out on computers other people
          use. You’re responsible for what happens in your account.
        </p>
      </LegalSection>

      <LegalSection title="Your materials">
        <p>
          What you add stays yours. Only add materials you’re allowed to use,
          such as your own notes or files your school gave you, and don’t add
          anything harmful or illegal.
        </p>
      </LegalSection>

      <LegalSection title="AI answers can be wrong">
        <p>
          SomaNami answers only from your materials and shows where each answer
          came from, but the AI can still make mistakes. Check important answers
          against the source before you rely on them. SomaNami helps you learn;
          it doesn’t do your work for you.
        </p>
      </LegalSection>

      <LegalSection title="Fair use">
        <p>
          Don’t try to break, overload or get around SomaNami’s protections, and
          don’t use it to harm anyone. We may suspend accounts that do.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          SomaNami is still growing. Features may change, and we’ll update these
          terms when they do. If you keep using SomaNami after a change, you
          accept the new version.
        </p>
      </LegalSection>

      <p className="mt-12 text-[15px] text-muted">
        Read how we handle your information in our{' '}
        <Link to="/privacy" className={TEXT_LINK}>
          Privacy Notice
        </Link>
        .
      </p>
    </AuthLayout>
  )
}
