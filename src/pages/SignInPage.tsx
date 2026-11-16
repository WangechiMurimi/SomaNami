import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import AuthLayout from '../features/auth/AuthLayout.tsx'
import FormAlert from '../features/auth/FormAlert.tsx'
import GoogleSignIn from '../features/auth/GoogleSignIn.tsx'
import PasswordField from '../features/auth/PasswordField.tsx'
import TextField from '../features/auth/TextField.tsx'
import Turnstile from '../features/auth/Turnstile.tsx'
import { useAuth } from '../features/auth/auth-context.ts'
import { authErrorMessage } from '../features/auth/auth-errors.ts'
import {
  AUTH_FOOTER,
  FOOTER_LINK,
  SMALL_LINK,
  SUBMIT_BUTTON,
} from '../features/auth/auth-ui.ts'
import { safeNextPath } from '../features/auth/safe-next.ts'
import { useCaptcha } from '../features/auth/use-captcha.ts'
import { useFocusFirstError } from '../features/auth/use-focus-first-error.ts'
import { isAuthConfigured } from '../lib/auth/is-configured.ts'

interface FieldErrors {
  email?: string
  password?: string
}

/** Email and password sign-in; sends the visitor on to `?next=` afterwards. */
export default function SignInPage() {
  const { status, signIn } = useAuth()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const captcha = useCaptcha()
  const { formRef, reportError } = useFocusFirstError<HTMLFormElement>()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'signed-in' || status === 'signed-in-offline') {
    return <Navigate to={next} replace />
  }

  const configured = isAuthConfigured()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors: FieldErrors = {}
    if (!email.trim()) errors.email = 'Enter your email address.'
    if (!password) errors.password = 'Enter your password.'
    setFieldErrors(errors)
    setFormError(null)
    if (errors.email || errors.password) return reportError()
    if (captcha.token === null) {
      setFormError('Complete the security check, then try again.')
      return reportError()
    }

    setSubmitting(true)
    const result = await signIn({
      email: email.trim(),
      password,
      captchaToken: captcha.token,
    })
    setSubmitting(false)
    // A successful sign-in re-renders into the redirect above.
    if (!result.ok) {
      captcha.renew()
      setFormError(authErrorMessage(result.error))
      reportError()
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      lede="Sign in to keep exploring your materials."
    >
      {!configured ? (
        <FormAlert>{authErrorMessage('not-configured')}</FormAlert>
      ) : (
        <>
          <GoogleSignIn next={next} />
          <form
            ref={formRef}
            noValidate
            onSubmit={handleSubmit}
            className="mt-4 flex flex-col gap-4"
          >
            {formError && <FormAlert>{formError}</FormAlert>}
            <TextField
              id="sign-in-email"
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldErrors.email}
            />
            <PasswordField
              id="sign-in-password"
              label="Password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
              below={
                <p className="mt-2">
                  <Link to="/forgot-password" className={SMALL_LINK}>
                    Forgot your password?
                  </Link>
                </p>
              }
            />
            <Turnstile onToken={captcha.onToken} resetKey={captcha.resetKey} />
            <button
              type="submit"
              disabled={submitting}
              className={`${SUBMIT_BUTTON} mt-2`}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </>
      )}
      <p className={AUTH_FOOTER}>
        New to SomaNami?{' '}
        <Link to="/sign-up" className={FOOTER_LINK}>
          Create an account
        </Link>
      </p>
    </AuthLayout>
  )
}
