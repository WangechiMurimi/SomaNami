import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { MfaApi } from '../../../types/auth.ts'
import FormAlert from '../FormAlert.tsx'
import { authErrorMessage } from '../auth-errors.ts'
import { SECONDARY_BUTTON } from '../auth-ui.ts'
import { useFocusFirstError } from '../use-focus-first-error.ts'
import CodeField from './CodeField.tsx'
import { codeError, normaliseCode } from './totp-code.ts'

interface RemoveAuthenticatorProps {
  factorId: string
  name: string
  mfa: Pick<MfaApi, 'verify' | 'unenroll'>
  onRemoved: () => void
  onCancel: () => void
}

/**
 * Removes an authenticator only after a fresh code from it, so someone at an
 * unlocked, signed-in device can't quietly switch two-step verification off.
 */
export default function RemoveAuthenticator({
  factorId,
  name,
  mfa,
  onRemoved,
  onCancel,
}: RemoveAuthenticatorProps) {
  const inputId = `mfa-remove-code-${factorId}`
  const { formRef, reportError } = useFocusFirstError<HTMLFormElement>()
  const [code, setCode] = useState('')
  const [fieldError, setFieldError] = useState<string>()
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => document.getElementById(inputId)?.focus(), [inputId])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const invalid = codeError(code)
    setFieldError(invalid)
    if (invalid) return reportError()

    setSubmitting(true)
    const verified = await mfa.verify(factorId, normaliseCode(code))
    const result = verified.ok ? await mfa.unenroll(factorId) : verified
    if (result.ok) return onRemoved()
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
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      className="mt-4 flex flex-col gap-4"
    >
      {formError && <FormAlert>{formError}</FormAlert>}
      <div className="max-w-xs">
        <CodeField
          id={inputId}
          label={`6-digit code from ${name}`}
          value={code}
          onChange={setCode}
          error={fieldError}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-11 items-center justify-center rounded-[10px] border border-warn px-[18px] text-sm font-medium text-warn transition-colors hover:bg-warn-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Removing…' : 'Remove authenticator'}
        </button>
        <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
          Cancel
        </button>
      </div>
    </form>
  )
}
