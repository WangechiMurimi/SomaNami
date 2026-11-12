import { Link } from 'react-router'
import { H1, LEDE } from './page-heading.ts'

/**
 * Holds a route the sidebar already links to while its screen is being
 * built, so the link is honest rather than broken or filled with mock data.
 */
export default function ComingSoonPage({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="max-w-3xl">
      <h1 className={H1}>{title}</h1>
      <p className={LEDE}>{description}</p>
      <p className="mt-6 rounded-xl border border-line bg-surface p-6 text-muted">
        This screen is on its way. Until then, your materials are in{' '}
        <Link to="/library" className="font-semibold text-accent underline">
          My library
        </Link>
        .
      </p>
    </div>
  )
}
