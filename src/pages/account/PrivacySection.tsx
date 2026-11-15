import { Link } from 'react-router'
import { CARD, CARD_TITLE } from './account-ui.ts'
import RemoveFromDevice from './RemoveFromDevice.tsx'

/** Points to how data is handled, and removes this account's materials. */
export default function PrivacySection() {
  return (
    <section aria-labelledby="account-privacy" className={CARD}>
      <h2 id="account-privacy" className={CARD_TITLE}>
        Privacy and data
      </h2>
      <p className="text-sm leading-[1.55] text-muted">
        What SomaNami keeps, and what happens when you ask a question, is set
        out in{' '}
        <Link
          to="/privacy"
          className="font-semibold text-accent hover:underline"
        >
          How your data is handled
        </Link>
        .
      </p>
      <div className="mt-auto border-t border-line pt-[18px]">
        <RemoveFromDevice />
      </div>
    </section>
  )
}
