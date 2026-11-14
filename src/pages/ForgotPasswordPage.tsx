import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import AuthLayout from '../features/auth/AuthLayout.tsx'
import FormAlert from '../features/auth/FormAlert.tsx'
import TextField from '../features/auth/TextField.tsx'
import Turnstile from '../features/auth/Turnstile.tsx'
import { useAuth } from '../features/auth/auth-context.ts'
import { authErrorMessage } from '../features/auth/auth-errors.ts'
import { PRIMARY_BUTTON, TEXT_LINK } from '../features/auth/auth-ui.ts'
import { useCaptcha } from '../features/auth/use-captcha.ts'
import { useFocusFirstError } from '../features/auth/use-focus-first-error.ts'
import { isAuthConfigured } from '../lib/auth/is-configured.ts'

/** Requests a reset link. The reply never says whether the account exists. */
export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const captcha = useCaptcha()
  const { formRef, reportError } = useFocusFirstError<HTMLFormElement>()
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string>()
  const [formError, setFormError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const error = email.trim() ? undefined : 'Enter your email address.'
    setEmailError(error)
    if (error) return reportError()
    if (captcha.token === null) {
      setFormError('Complete the security check, then try again.')
      return reportError()
    }

    setSubmitting(true)
    const result = await requestPasswordReset({
      email: email.trim(),
      captchaToken: captcha.token,
    })
    setSubmitting(false)
    if (result.ok) return setSent(true)
    captcha.renew()
    setFormError(authErrorMessage(result.error))
    reportError()
  }

  return (
    <AuthLayout
      title="Reset your password"
      lede="Enter the email you signed up with and we’ll send you a link to choose a new password."
    >
      {!isAuthConfigured() ? (
        <FormAlert>{authErrorMessage('not-configured')}</FormAlert>
      ) : sent ? (
        <FormAlert tone="success">
          If an account exists for that email, we’ve emailed it a link. It may
          take a few minutes, and it could land in your spam folder.
        </FormAlert>
      ) : (
        <form
          ref={formRef}
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col gap-5"
        >
          {formError && <FormAlert>{formError}</FormAlert>}
          <TextField
            id="reset-email"
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailError}
          />
          <Turnstile onToken={captcha.onToken} resetKey={captcha.resetKey} />
          <button
            type="submit"
            disabled={submitting}
            className={PRIMARY_BUTTON}
          >
            {submitting ? 'Sending…' : 'Email me a reset link'}
          </button>
        </form>
      )}
      <p className="mt-8 text-[15px] text-muted">
        Remembered it?{' '}
        <Link to="/sign-in" className={TEXT_LINK}>
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
