import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import AuthLayout from '../features/auth/AuthLayout.tsx'
import FormAlert from '../features/auth/FormAlert.tsx'
import PasswordField from '../features/auth/PasswordField.tsx'
import TextField from '../features/auth/TextField.tsx'
import Turnstile from '../features/auth/Turnstile.tsx'
import { useAuth } from '../features/auth/auth-context.ts'
import { authErrorMessage } from '../features/auth/auth-errors.ts'
import {
  MIN_PASSWORD,
  PRIMARY_BUTTON,
  TEXT_LINK,
} from '../features/auth/auth-ui.ts'
import { useCaptcha } from '../features/auth/use-captcha.ts'
import { useFocusFirstError } from '../features/auth/use-focus-first-error.ts'
import { isAuthConfigured } from '../lib/auth/is-configured.ts'

/**
 * Account creation comes first; the details step (name and 13-or-older)
 * follows once the account exists, so nothing about age is asked up front.
 */
export default function SignUpPage() {
  const { status } = useAuth()
  const [sentTo, setSentTo] = useState<string | null>(null)

  // A new session (no email confirmation) lands in RequireProfile, which
  // opens the details step.
  if (status === 'signed-in' || status === 'signed-in-offline') {
    return <Navigate to="/" replace />
  }

  if (sentTo !== null) {
    return (
      <AuthLayout
        title="Check your email"
        lede={
          <>
            We’ve sent a link to <strong className="text-fg">{sentTo}</strong>.
            Open it to confirm your account, then sign in.
          </>
        }
      >
        <Link to="/sign-in" className={TEXT_LINK}>
          Go to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      lede="Next, you’ll tell us what to call you."
    >
      {!isAuthConfigured() ? (
        <FormAlert>{authErrorMessage('not-configured')}</FormAlert>
      ) : (
        <AccountForm onSent={setSentTo} />
      )}
      <p className="mt-8 text-[15px] text-muted">
        Already have an account?{' '}
        <Link to="/sign-in" className={TEXT_LINK}>
          Sign in
        </Link>
      </p>
      <p className="mt-3 text-[15px]">
        <Link to="/your-data" className={TEXT_LINK}>
          How your data is handled
        </Link>
      </p>
    </AuthLayout>
  )
}

interface AccountErrors {
  email?: string
  password?: string
}

function AccountForm({ onSent }: { onSent: (email: string) => void }) {
  const { signUp } = useAuth()
  const captcha = useCaptcha()
  const { formRef, reportError } = useFocusFirstError<HTMLFormElement>()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<AccountErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: AccountErrors = {}
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      next.email = 'Enter an email address like name@example.com.'
    }
    if (password.length < MIN_PASSWORD) {
      next.password = `Use at least ${MIN_PASSWORD} characters.`
    }
    setErrors(next)
    setFormError(null)
    if (next.email || next.password) return reportError()
    if (captcha.token === null) {
      setFormError('Complete the security check, then try again.')
      return reportError()
    }

    setSubmitting(true)
    const result = await signUp({
      email: email.trim(),
      password,
      captchaToken: captcha.token,
    })
    setSubmitting(false)
    if (result.ok) return onSent(email.trim())
    captcha.renew()
    setFormError(authErrorMessage(result.error))
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
      <TextField
        id="sign-up-email"
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
      />
      <PasswordField
        id="sign-up-password"
        label="Password"
        name="new-password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        hint={`At least ${MIN_PASSWORD} characters. A short phrase works well.`}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
      />
      <Turnstile onToken={captcha.onToken} resetKey={captcha.resetKey} />
      <button type="submit" disabled={submitting} className={PRIMARY_BUTTON}>
        {submitting ? 'Creating your account…' : 'Create account'}
      </button>
    </form>
  )
}
