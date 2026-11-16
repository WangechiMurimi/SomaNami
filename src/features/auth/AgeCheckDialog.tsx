import { useState } from 'react'
import { Link } from 'react-router'
import Dialog, {
  DIALOG_PRIMARY,
  DIALOG_SECONDARY,
} from '../../components/Dialog.tsx'
import FormAlert from './FormAlert.tsx'
import RequiredCheckbox from './RequiredCheckbox.tsx'
import { useAuth } from './auth-context.ts'
import { authErrorMessage } from './auth-errors.ts'
import { TEXT_LINK } from './auth-ui.ts'

interface Errors {
  age?: string
  consent?: string
}

/**
 * Asked once, on first use, of accounts that haven't confirmed they're 13 or
 * older and accepted the Terms: Google sign-ups, which skip the email form.
 * It can't be dismissed; the only ways out are confirming or signing out.
 */
export default function AgeCheckDialog() {
  const { confirmFirstUse, signOut } = useAuth()
  const [oldEnough, setOldEnough] = useState(false)
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    const next: Errors = {}
    if (!oldEnough) next.age = 'SomaNami is for learners 13 and older.'
    if (!consent) {
      next.consent =
        'Agree to the Terms and how your data is handled to continue.'
    }
    setErrors(next)
    setError(null)
    if (next.age || next.consent) return
    setBusy(true)
    const result = await confirmFirstUse({
      consentedAt: new Date().toISOString(),
    })
    // On success the dialog unmounts as the session updates.
    if (!result.ok) {
      setBusy(false)
      setError(authErrorMessage(result.error))
    }
  }

  return (
    <Dialog
      title="Welcome to SomaNami"
      description="SomaNami answers your questions using only the sources you add. Before you start, please confirm two things."
    >
      {error && <FormAlert>{error}</FormAlert>}
      <RequiredCheckbox
        id="first-use-age"
        checked={oldEnough}
        onChange={setOldEnough}
        error={errors.age}
      >
        I’m 13 or older
      </RequiredCheckbox>
      <RequiredCheckbox
        id="first-use-consent"
        checked={consent}
        onChange={setConsent}
        error={errors.consent}
      >
        I agree to the{' '}
        <Link to="/terms" target="_blank" className={TEXT_LINK}>
          Terms
        </Link>{' '}
        and{' '}
        <Link to="/privacy" target="_blank" className={TEXT_LINK}>
          how your data is handled
        </Link>
        .
      </RequiredCheckbox>
      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={() => void signOut()}
          className={DIALOG_SECONDARY}
        >
          Sign out
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirm()}
          className={DIALOG_PRIMARY}
        >
          {busy ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </Dialog>
  )
}
