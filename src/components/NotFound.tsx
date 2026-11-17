import { Link } from 'react-router'
import { H1, LEDE } from '../pages/page-heading.ts'

/** A page-level "can't find it" screen with a way back. */
export default function NotFound({
  title,
  note,
  linkTo,
  linkLabel,
}: {
  title: string
  /** Why it might be missing, shown before the link. */
  note?: string
  linkTo: string
  linkLabel: string
}) {
  return (
    <div>
      <h1 className={H1}>{title}</h1>
      <p className={LEDE}>
        {note && <>{note} </>}
        <Link to={linkTo} className="font-semibold text-accent underline">
          {linkLabel}
        </Link>
      </p>
    </div>
  )
}
