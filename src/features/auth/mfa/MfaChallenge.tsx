import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import type { MfaApi, MfaFactor } from '../../../types/auth.ts'
import AuthLayout from '../AuthLayout.tsx'
import FormAlert from '../FormAlert.tsx'
import { useAuth } from '../auth-context.ts'
import { authErrorMessage } from '../auth-errors.ts'
import { PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_LINK } from '../auth-ui.ts'
import { safeNextPath, signInPathFor } from '../safe-next.ts'
import { useFocusFirstError } from '../use-focus-first-error.ts'
import CodeField from './CodeField.tsx'
import { factorLabel } from './factor-label.ts'
import { codeError, normaliseCode } from './totp-code.ts'
import { useFactors } from './use-factors.ts'

const CODE_ID = 'mfa-challenge-code'

/**
 * Code-entry screen for `needs-mfa`, routed at `/sign-in/verify`: the password
 * was accepted, and the account's authenticator code opens the app.
 */
export default function MfaChallenge() {
  const { status } = useAuth()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))

  if (status === 'signed-in' || status === 'signed-in-offline') {
    return <Navigate to={next} replace />
  }
  if (status === 'signed-out') {
    return <Navigate to={signInPathFor(next, '', '')} replace />
  }
  return (
    <AuthLayout
      title="Enter your code"
      lede="Open your authenticator app and enter the 6-digit code it shows for SomaNami."
    >
      {status === 'loading' ? <Loading /> : <ChallengeForm />}
    </AuthLayout>
  )
}

const Loading = () => (
  <p role="status" className="text-[15px] text-muted">
    Loading…
  </p>
)

function ChallengeForm() {
  const { mfa, signOut } = useAuth()
  const factors = useFactors()
  const verified =
    factors.phase === 'ready'
      ? factors.factors.filter((f) => f.status === 'verified')
      : []

  return (
    <>
      {factors.phase === 'loading' && <Loading />}
      {factors.phase === 'error' && (
        <div className="flex flex-col items-start gap-4">
          <FormAlert>{factors.message}</FormAlert>
          <button
            type="button"
            onClick={() => void factors.reload()}
            className={SECONDARY_BUTTON}
          >
            Try again
          </button>
        </div>
      )}
      {factors.phase === 'ready' &&
        (verified.length > 0 ? (
          <CodeForm factors={verified} verify={mfa.verify} />
        ) : (
          // `needs-mfa` implies a verified factor; reaching here means the
          // account changed under us, and signing in again sorts it out.
          <FormAlert>{authErrorMessage('unknown')}</FormAlert>
        ))}
      <p className="mt-8 text-[15px] text-muted">
        Not your account?{' '}
        <button
          type="button"
          onClick={() => void signOut()}
          className={`${TEXT_LINK} cursor-pointer`}
        >
          Use a different account
        </button>
      </p>
    </>
  )
}

interface CodeFormProps {
  factors: MfaFactor[]
  verify: MfaApi['verify']
}

function CodeForm({ factors, verify }: CodeFormProps) {
  const { formRef, reportError } = useFocusFirstError<HTMLFormElement>()
  const [factorId, setFactorId] = useState(() => factors[0]?.id ?? '')
  const [code, setCode] = useState('')
  const [fieldError, setFieldError] = useState<string>()
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // The code is the only thing to do on this screen.
  useEffect(() => document.getElementById(CODE_ID)?.focus(), [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const invalid = codeError(code)
    setFieldError(invalid)
    if (invalid) return reportError()

    setSubmitting(true)
    const result = await verify(factorId, normaliseCode(code))
    // Success re-renders the screen into a redirect to `next`.
    if (result.ok) return
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
      className="flex flex-col gap-5"
    >
      {formError && <FormAlert>{formError}</FormAlert>}
      {factors.length > 1 && (
        // A backup authenticator has its own secret, so Supabase needs to
        // know which one the code came from.
        <fieldset role="radiogroup" className="flex flex-col gap-1">
          <legend className="mb-1.5 text-[15px] leading-[1.5] font-medium text-fg">
            Authenticator
          </legend>
          {factors.map((factor, index) => (
            <label
              key={factor.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-fg"
            >
              <input
                type="radio"
                name="factor"
                value={factor.id}
                checked={factorId === factor.id}
                onChange={() => setFactorId(factor.id)}
                className="size-5 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
              {factorLabel(factor, index)}
            </label>
          ))}
        </fieldset>
      )}
      <CodeField
        id={CODE_ID}
        value={code}
        onChange={setCode}
        error={fieldError}
      />
      <button type="submit" disabled={submitting} className={PRIMARY_BUTTON}>
        {submitting ? 'Verifying…' : 'Verify'}
      </button>
    </form>
  )
}
