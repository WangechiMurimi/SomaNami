import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import AuthLayout from '../features/auth/AuthLayout.tsx'
import FormAlert from '../features/auth/FormAlert.tsx'
import GoogleButton from '../features/auth/GoogleButton.tsx'
import PasswordField from '../features/auth/PasswordField.tsx'
import RequiredCheckbox from '../features/auth/RequiredCheckbox.tsx'
import TextField from '../features/auth/TextField.tsx'
import Turnstile from '../features/auth/Turnstile.tsx'
import { useAuth } from '../features/auth/auth-context.ts'
import { authErrorMessage } from '../features/auth/auth-errors.ts'
import {
  AUTH_FOOTER,
  FOOTER_LINK,
  MIN_PASSWORD,
  SECONDARY_BUTTON,
  SUBMIT_BUTTON,
  TEXT_LINK,
} from '../features/auth/auth-ui.ts'
import { useCaptcha } from '../features/auth/use-captcha.ts'
import { useFocusFirstError } from '../features/auth/use-focus-first-error.ts'
import { isAuthConfigured } from '../lib/auth/is-configured.ts'

type Step = 'account' | 'details' | 'sent'

/**
 * Account creation. Google goes straight to Google, and the 13+ and Terms
 * questions come once after the first sign-in (AgeCheckDialog). Email takes
 * two steps: email and password, then the 13+ confirmation and consent.
 * No birth date is ever asked for.
 */
export default function SignUpPage() {
  const { status } = useAuth()
  const [step, setStep] = useState<Step>('account')
  // Kept here, not in the step, so Back returns to a filled-in form.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (status === 'signed-in' || status === 'signed-in-offline') {
    return <Navigate to="/" replace />
  }

  if (step === 'sent') {
    return (
      <AuthLayout
        title="Check your email"
        lede={
          <>
            We’ve sent a link to <strong className="text-fg">{email}</strong>.
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

  const configured = isAuthConfigured()

  return (
    <AuthLayout
      eyebrow={
        configured ? `Step ${step === 'account' ? 1 : 2} of 2` : undefined
      }
      title={step === 'account' ? 'Create your account' : 'A little about you'}
      lede={
        step === 'account'
          ? 'Start with Google, or use an email and password.'
          : 'We only ask for what the app uses.'
      }
    >
      {!configured ? (
        <FormAlert>{authErrorMessage('not-configured')}</FormAlert>
      ) : step === 'account' ? (
        <AccountStep
          email={email}
          password={password}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onContinue={() => setStep('details')}
        />
      ) : (
        <DetailsStep
          email={email.trim()}
          password={password}
          onBack={() => setStep('account')}
          onSent={() => setStep('sent')}
        />
      )}
      {step === 'account' && (
        <p className={AUTH_FOOTER}>
          Already have an account?{' '}
          <Link to="/sign-in" className={FOOTER_LINK}>
            Sign in
          </Link>
        </p>
      )}
    </AuthLayout>
  )
}

interface AccountStepProps {
  email: string
  password: string
  onEmailChange: (email: string) => void
  onPasswordChange: (password: string) => void
  onContinue: () => void
}

/**
 * Step 1: Google leaves for Google at once; an email and password move on to
 * step 2, with nothing sent yet.
 */
function AccountStep({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onContinue,
}: AccountStepProps) {
  const { signInWithGoogle } = useAuth()
  const { formRef, reportError } = useFocusFirstError<HTMLFormElement>()
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  )
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [openingGoogle, setOpeningGoogle] = useState(false)

  async function continueWithGoogle() {
    setGoogleError(null)
    setOpeningGoogle(true)
    const result = await signInWithGoogle()
    // On success the browser is already leaving for Google; stay busy.
    if (!result.ok) {
      setOpeningGoogle(false)
      setGoogleError(authErrorMessage(result.error))
      reportError()
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: typeof errors = {}
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      next.email = 'Enter an email address like name@example.com.'
    }
    if (password.length < MIN_PASSWORD) {
      next.password = `Use at least ${MIN_PASSWORD} characters.`
    }
    setErrors(next)
    if (next.email || next.password) return reportError()
    onContinue()
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
    >
      {googleError && <FormAlert>{googleError}</FormAlert>}
      <GoogleButton
        onClick={() => void continueWithGoogle()}
        busy={openingGoogle}
      />
      <TextField
        id="sign-up-email"
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
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
        onChange={(e) => onPasswordChange(e.target.value)}
        error={errors.password}
      />
      <button type="submit" className={`${SUBMIT_BUTTON} mt-2`}>
        Continue
      </button>
    </form>
  )
}

interface DetailsErrors {
  age?: string
  consent?: string
}

interface DetailsStepProps {
  email: string
  password: string
  onBack: () => void
  onSent: () => void
}

/** Step 2: the 13+ confirmation and consent, then the account is created. */
function DetailsStep({ email, password, onBack, onSent }: DetailsStepProps) {
  const { signUp } = useAuth()
  const captcha = useCaptcha()
  const { formRef, reportError } = useFocusFirstError<HTMLFormElement>()
  const [oldEnough, setOldEnough] = useState(false)
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<DetailsErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: DetailsErrors = {}
    if (!oldEnough) {
      next.age = 'SomaNami is for learners 13 and older.'
    }
    if (!consent) {
      next.consent =
        'Agree to the Terms and how your data is handled to continue.'
    }
    setErrors(next)
    setFormError(null)
    if (next.age || next.consent) return reportError()

    if (captcha.token === null) {
      setFormError('Complete the security check, then try again.')
      return reportError()
    }
    setSubmitting(true)
    const result = await signUp({
      email,
      password,
      captchaToken: captcha.token,
      consentedAt: new Date().toISOString(),
    })
    setSubmitting(false)
    if (result.ok) return onSent()
    captcha.renew()
    setFormError(authErrorMessage(result.error))
    reportError()
  }

  const submitLabel = submitting ? 'Creating your account…' : 'Create account'

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
    >
      {formError && <FormAlert>{formError}</FormAlert>}
      {/* TODO(#143): "What should we call you?" goes here once profiles can store it. */}
      <RequiredCheckbox
        id="sign-up-age"
        checked={oldEnough}
        onChange={setOldEnough}
        error={errors.age}
      >
        I’m 13 or older
      </RequiredCheckbox>
      <RequiredCheckbox
        id="sign-up-consent"
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
      <div className="rounded-xl border border-line bg-surface p-4 text-sm leading-[1.6] text-muted">
        SomaNami answers only from the sources you add, and you can delete them
        at any time.{' '}
        <Link to="/privacy" target="_blank" className={TEXT_LINK}>
          How your data is handled
        </Link>
      </div>
      <Turnstile onToken={captcha.onToken} resetKey={captcha.resetKey} />
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className={`${SECONDARY_BUTTON} h-12 flex-none bg-surface`}
        >
          Back
        </button>
        <button
          type="submit"
          disabled={submitting}
          className={`${SUBMIT_BUTTON} flex-1`}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
