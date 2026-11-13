import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import AuthLayout from '../features/auth/AuthLayout.tsx'
import FormAlert from '../features/auth/FormAlert.tsx'
import PasswordField from '../features/auth/PasswordField.tsx'
import { useAuth } from '../features/auth/auth-context.ts'
import { authErrorMessage } from '../features/auth/auth-errors.ts'
import { PRIMARY_BUTTON, TEXT_LINK } from '../features/auth/auth-ui.ts'
import { useFocusFirstError } from '../features/auth/use-focus-first-error.ts'

const MIN_PASSWORD = 10

/**
 * Target of the reset email's link. Supabase reads the link and signs the
 * user in for recovery; this page then sets the new password.
 */
export default function UpdatePasswordPage() {
  const { status, user, updatePassword } = useAuth()
  const { formRef, reportError } = useFocusFirstError<HTMLFormElement>()
  const [password, setPassword] = useState('')
  const [fieldError, setFieldError] = useState<string>()
  const [formError, setFormError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'loading') {
    return (
      <AuthLayout title="Reset your password">
        <p role="status" className="text-[15px] text-muted">
          Checking your link…
        </p>
      </AuthLayout>
    )
  }
  if (status === 'needs-mfa') {
    // Accounts with an authenticator prove it before changing the password.
    return (
      <Navigate
        to={`/sign-in/verify?next=${encodeURIComponent('/update-password')}`}
        replace
      />
    )
  }
  if (status === 'signed-out') {
    return (
      <AuthLayout
        title="This link has expired"
        lede="Reset links work once and only for a short time."
      >
        <Link to="/forgot-password" className={TEXT_LINK}>
          Request a new link
        </Link>
      </AuthLayout>
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const error =
      password.length < MIN_PASSWORD
        ? `Use at least ${MIN_PASSWORD} characters.`
        : undefined
    setFieldError(error)
    if (error) return reportError()

    setSubmitting(true)
    const result = await updatePassword(password)
    setSubmitting(false)
    if (result.ok) return setDone(true)
    setFormError(authErrorMessage(result.error))
    reportError()
  }

  return (
    <AuthLayout title="Choose a new password">
      {done ? (
        <div className="flex flex-col gap-6">
          <FormAlert tone="success">Your password is updated.</FormAlert>
          <Link to="/" className={TEXT_LINK}>
            Go to SomaNami
          </Link>
        </div>
      ) : (
        <form
          ref={formRef}
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-5"
        >
          {formError && <FormAlert>{formError}</FormAlert>}
          {/* Lets password managers update the right saved login. */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={user?.email ?? ''}
            hidden
            readOnly
          />
          <PasswordField
            id="new-password"
            label="New password"
            name="new-password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            hint={`At least ${MIN_PASSWORD} characters.`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldError}
          />
          <button
            type="submit"
            disabled={submitting}
            className={PRIMARY_BUTTON}
          >
            {submitting ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
