import { Link } from 'react-router'
import AuthLayout from '../features/auth/AuthLayout.tsx'
import { TEXT_LINK } from '../features/auth/auth-ui.ts'

/**
 * Public placeholder for the team's own note on how learners' data is
 * handled. It replaces the generated Privacy and Terms pages, which nobody
 * on the team wrote or reviewed.
 */
export default function DataHandlingPage() {
  return (
    <AuthLayout
      wide
      title="How your data is handled"
      lede="The SomaNami team is writing this note."
    >
      {/* TODO(#142): replace with the team's reviewed note on data handling. */}
      <p className="text-[15px] leading-[1.6] text-muted">
        This page will explain, in plain language, what SomaNami keeps about
        you, where it is stored, and how to delete it. Until it is ready, ask
        the team if you have a question.
      </p>
      <p className="mt-8 text-[15px]">
        <Link to="/" className={TEXT_LINK}>
          Back to SomaNami
        </Link>
      </p>
    </AuthLayout>
  )
}
