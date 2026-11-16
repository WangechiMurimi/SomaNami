import { Link } from 'react-router'
import AuthLayout from '../features/auth/AuthLayout.tsx'
import LegalSection from '../features/auth/LegalSection.tsx'
import Confirm from '../features/auth/OwnerToConfirm.tsx'
import { TEXT_LINK } from '../features/auth/auth-ui.ts'

/**
 * The Terms of Use, written in plain language for learners aged 13 and up.
 * Facts only the owner can supply (jurisdiction, contact) are marked to
 * confirm. Public route.
 */
export default function TermsPage() {
  return (
    <AuthLayout
      wide
      title="Terms of Use"
      lede="The agreement between you and SomaNami. Last updated November 2026."
    >
      <LegalSection title="1. Agreeing to these terms">
        <p>
          These terms apply whenever you use SomaNami. By creating an account,
          or by ticking the box that says you agree, you accept these terms and{' '}
          <Link to="/privacy" className={TEXT_LINK}>
            how your data is handled
          </Link>
          . If you don’t agree, please don’t use SomaNami.
        </p>
      </LegalSection>

      <LegalSection title="2. Who can use SomaNami">
        <p>
          You must be <strong>13 or older</strong> to make an account. If you’re
          under 18, or under the age of adulthood where you live, a parent or
          guardian should read these terms with you and agree to them for you.
          If we learn that an account belongs to someone under 13, we will close
          it and delete its materials.
        </p>
      </LegalSection>

      <LegalSection title="3. Your account">
        <ul>
          <li>Give a real email address you can check.</li>
          <li>
            Keep your password private and don’t share your account. You’re
            responsible for what happens in it.
          </li>
          <li>
            Tell us straight away if you think someone else has used your
            account.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Your materials">
        <p>
          You keep ownership of everything you add, such as files and notes
          (“your materials”). You give SomaNami permission to store and process
          your materials only so it can provide the service to you: to read
          them, search them and answer your questions from them. We don’t use
          your materials for anything else, and the permission ends when you
          delete them or close your account.
        </p>
        <p>
          Only add materials you have the right to use, such as your own notes
          or files your school or teacher gave you. You’re responsible for what
          you add.
        </p>
      </LegalSection>

      <LegalSection title="5. Acceptable use">
        <p>Please don’t:</p>
        <ul>
          <li>
            add anything illegal, hateful, or that harms or harasses others;
          </li>
          <li>
            add material that breaks someone else’s copyright or privacy, or
            shares other people’s personal information without permission;
          </li>
          <li>
            try to break into, overload, copy or get around SomaNami’s security
            and limits, including by automated means;
          </li>
          <li>
            use SomaNami to cheat where your school or course doesn’t allow it.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="6. AI answers">
        <p>
          SomaNami uses AI to answer from the sources you add and shows where
          each answer came from. AI can still get things wrong or leave things
          out. Answers are a study aid, not professional, medical, legal or
          financial advice, so check anything important against the source.
        </p>
      </LegalSection>

      <LegalSection title="7. SomaNami’s content">
        <p>
          The SomaNami app, its design, name and logo belong to us. You may use
          the app as these terms allow, but you may not copy, sell or reuse it.
          Answers generated for you are yours to use for your own learning.
        </p>
      </LegalSection>

      <LegalSection title="8. Ending your use">
        <p>
          You can stop using SomaNami, delete your materials or close your
          account at any time. We may suspend or close an account that breaks
          these terms, putting others or the service at risk, and we’ll tell you
          why unless the law stops us.
        </p>
      </LegalSection>

      <LegalSection title="9. The service “as is”">
        <p>
          SomaNami is still being built. Features may change, pause or stop, and
          we can’t promise it will always be available or free of errors. Keep
          your own copies of anything important you add. As far as the law
          allows, SomaNami is provided “as is”, and we aren’t responsible for
          indirect losses, such as lost files or grades, that come from using
          it. Nothing in these terms limits rights you have by law that can’t be
          limited.
        </p>
      </LegalSection>

      <LegalSection title="10. Changes to these terms">
        <p>
          We may update these terms as SomaNami changes. We’ll change the date
          at the top, and for important changes we’ll let you know in the app or
          by email. If you keep using SomaNami after a change, you accept the
          new terms.
        </p>
      </LegalSection>

      <LegalSection title="11. Law and contact">
        <p>
          These terms are governed by the laws of{' '}
          <Confirm>jurisdiction</Confirm>. Questions about them? Contact us at{' '}
          <Confirm>contact email</Confirm>.
        </p>
      </LegalSection>
    </AuthLayout>
  )
}
