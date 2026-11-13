import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { MfaApi, TotpEnrollment } from '../../../types/auth.ts'
import FormAlert from '../FormAlert.tsx'
import { authErrorMessage } from '../auth-errors.ts'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../auth-ui.ts'
import { useFocusFirstError } from '../use-focus-first-error.ts'
import CodeField from './CodeField.tsx'
import { qrImageSrc } from './qr-src.ts'
import { codeError, normaliseCode } from './totp-code.ts'

interface EnrolAuthenticatorProps {
  enrollment: TotpEnrollment
  /** True when this is the account's first authenticator. */
  first: boolean
  verify: MfaApi['verify']
  onVerified: () => void
  onCancel: () => void
}

const STEP = 'text-[15px] leading-[1.6] text-fg'

/** Groups the setup key in fours, the way authenticator apps print it. */
const grouped = (secret: string) => secret.match(/.{1,4}/g)?.join(' ') ?? ''

/**
 * Setup steps for a new authenticator: scan the QR code (or type the key),
 * then prove it works with a code. Until then the factor stays unverified.
 */
export default function EnrolAuthenticator({
  enrollment,
  first,
  verify,
  onVerified,
  onCancel,
}: EnrolAuthenticatorProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { formRef, reportError } = useFocusFirstError<HTMLFormElement>()
  const [code, setCode] = useState('')
  const [fieldError, setFieldError] = useState<string>()
  const [formError, setFormError] = useState<string | null>(null)
  const [copyNote, setCopyNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Screen readers land on the new steps rather than the button that's gone.
  useEffect(() => headingRef.current?.focus(), [])

  function copyKey() {
    const done = () => setCopyNote('Key copied.')
    const failed = () =>
      setCopyNote('Couldn’t copy. Select the key and copy it instead.')
    if (!navigator.clipboard) return failed()
    navigator.clipboard.writeText(enrollment.secret).then(done, failed)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const invalid = codeError(code)
    setFieldError(invalid)
    if (invalid) return reportError()

    setSubmitting(true)
    const result = await verify(enrollment.factorId, normaliseCode(code))
    if (result.ok) return onVerified()
    setSubmitting(false)
    setCode('')
    if (result.error === 'invalid-code') {
      setFieldError(authErrorMessage(result.error))
    } else {
      setFormError(authErrorMessage(result.error))
    }
    reportError()
  }

  return (
    <div className="mt-6 rounded-[12px] border border-line bg-surface p-5 md:p-6">
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="text-[20px] leading-[1.3] font-medium text-fg focus:outline-none"
      >
        Add SomaNami to your authenticator app
      </h3>
      <ol className="mt-5 flex list-decimal flex-col gap-6 pl-5">
        <li className={STEP}>
          Open an authenticator app on your phone and scan this QR code.
          <img
            src={qrImageSrc(enrollment.qrCode)}
            alt="QR code for your authenticator app. If you can’t scan it, use the setup key in the next step."
            width={176}
            height={176}
            // QR codes need dark modules on light ground, even in dark mode.
            className="mt-3 size-44 rounded-[10px] bg-white p-2"
          />
        </li>
        <li className={STEP}>
          Can’t scan it? Enter this setup key instead.
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="rounded-[6px] bg-tint px-3 py-2 font-mono text-[15px] tracking-wide break-normal text-fg select-all">
              {grouped(enrollment.secret)}
            </code>
            <button
              type="button"
              onClick={copyKey}
              className={SECONDARY_BUTTON}
            >
              Copy key
            </button>
          </div>
          <p role="status" className="mt-1.5 text-[13px] text-muted">
            {copyNote}
          </p>
        </li>
        <li className={STEP}>
          Enter the code the app shows to finish.
          <form
            ref={formRef}
            noValidate
            onSubmit={handleSubmit}
            className="mt-3 flex flex-col gap-5"
          >
            {formError && <FormAlert>{formError}</FormAlert>}
            <div className="max-w-xs">
              <CodeField
                id="mfa-enrol-code"
                value={code}
                onChange={setCode}
                error={fieldError}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={submitting}
                className={`${PRIMARY_BUTTON} sm:w-auto`}
              >
                {submitting ? 'Checking…' : first ? 'Turn on' : 'Add'}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className={SECONDARY_BUTTON}
              >
                Cancel
              </button>
            </div>
          </form>
        </li>
      </ol>
    </div>
  )
}
