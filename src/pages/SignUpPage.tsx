import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import AuthLayout from '../features/auth/AuthLayout.tsx'
import FormAlert from '../features/auth/FormAlert.tsx'
import PasswordField from '../features/auth/PasswordField.tsx'
import TextField from '../features/auth/TextField.tsx'
import Turnstile from '../features/auth/Turnstile.tsx'
import {
  isAgeBlocked,
  isOldEnough,
  markAgeBlocked,
} from '../features/auth/age-gate.ts'
import { useAuth } from '../features/auth/auth-context.ts'
import { authErrorMessage } from '../features/auth/auth-errors.ts'
import {
  FIELD_ERROR,
  INPUT,
  INPUT_ERROR,
  INPUT_OK,
  LABEL,
  MIN_PASSWORD,
  PRIMARY_BUTTON,
  TEXT_LINK,
} from '../features/auth/auth-ui.ts'
import { useCaptcha } from '../features/auth/use-captcha.ts'
import { useFocusFirstError } from '../features/auth/use-focus-first-error.ts'
import { isAuthConfigured } from '../lib/auth/is-configured.ts'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

type Step = 'birth' | 'blocked' | 'account' | 'sent'

/** Account creation: a neutral age screen, then email, password and consent. */
export default function SignUpPage() {
  const { status } = useAuth()
  const [step, setStep] = useState<Step>(() =>
    isAgeBlocked() ? 'blocked' : 'birth',
  )
  const [sentTo, setSentTo] = useState('')

  if (status === 'signed-in' || status === 'signed-in-offline') {
    return <Navigate to="/" replace />
  }

  if (step === 'blocked') {
    return (
      <AuthLayout
        title="SomaNami is for learners 13 and older"
        lede="Thanks for wanting to learn with us. You’re welcome to come back once you’ve turned 13."
      >
        <p className="text-[15px] text-muted">
          Read how we look after learners in our{' '}
          <Link to="/privacy" className={TEXT_LINK}>
            Privacy Notice
          </Link>
          .
        </p>
      </AuthLayout>
    )
  }

  if (step === 'sent') {
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
      lede="Your materials stay private to you, on this device."
    >
      {!isAuthConfigured() ? (
        <FormAlert>{authErrorMessage('not-configured')}</FormAlert>
      ) : step === 'birth' ? (
        <BirthStep
          onPass={() => setStep('account')}
          onBlock={() => {
            markAgeBlocked()
            setStep('blocked')
          }}
        />
      ) : (
        <AccountStep
          onSent={(email) => {
            setSentTo(email)
            setStep('sent')
          }}
        />
      )}
      <p className="mt-8 text-[15px] text-muted">
        Already have an account?{' '}
        <Link to="/sign-in" className={TEXT_LINK}>
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}

/**
 * Asks only for month and year, and keeps them only in this component:
 * nothing about the date leaves it, just pass or block.
 */
function BirthStep({
  onPass,
  onBlock,
}: {
  onPass: () => void
  onBlock: () => void
}) {
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const [errors, setErrors] = useState<{ month?: string; year?: string }>({})
  const { formRef, reportError } = useFocusFirstError<HTMLFormElement>()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const now = new Date()
    const y = Number(year)
    const m = Number(month)
    const next: typeof errors = {}
    if (!m) next.month = 'Choose the month you were born.'
    if (
      !/^\d{4}$/.test(year) ||
      y < now.getFullYear() - 120 ||
      y > now.getFullYear() ||
      (y === now.getFullYear() && m > now.getMonth() + 1)
    ) {
      next.year = 'Enter the year you were born.'
    }
    setErrors(next)
    if (next.month || next.year) return reportError()
    if (isOldEnough({ month: m, year: y }, now)) onPass()
    else onBlock()
  }

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit}>
      <fieldset>
        <legend className="text-[15px] leading-[1.5] font-medium text-fg">
          When were you born?
        </legend>
        <p className="mt-1 text-[13px] text-muted">
          We only use this to check who can make an account, and we don’t keep
          it.
        </p>
        <div className="mt-4 grid grid-cols-[3fr_2fr] gap-3">
          <div>
            <label htmlFor="birth-month" className={LABEL}>
              Month
            </label>
            <select
              id="birth-month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              aria-invalid={errors.month ? true : undefined}
              aria-describedby={errors.month ? 'birth-month-error' : undefined}
              className={`${INPUT} ${errors.month ? INPUT_ERROR : INPUT_OK}`}
            >
              <option value="">Choose…</option>
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
            {errors.month && (
              <p id="birth-month-error" className={FIELD_ERROR}>
                {errors.month}
              </p>
            )}
          </div>
          <TextField
            id="birth-year"
            label="Year"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="YYYY"
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
            error={errors.year}
          />
        </div>
      </fieldset>
      <button type="submit" className={`${PRIMARY_BUTTON} mt-6`}>
        Continue
      </button>
    </form>
  )
}

interface AccountErrors {
  email?: string
  password?: string
  consent?: string
}

function AccountStep({ onSent }: { onSent: (email: string) => void }) {
  const { signUp } = useAuth()
  const captcha = useCaptcha()
  const { formRef, reportError } = useFocusFirstError<HTMLFormElement>()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [consent, setConsent] = useState(false)
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
    if (!consent) {
      next.consent = 'Agree to the Terms and Privacy Notice to continue.'
    }
    setErrors(next)
    setFormError(null)
    if (next.email || next.password || next.consent) return reportError()
    if (captcha.token === null) {
      setFormError('Complete the security check, then try again.')
      return reportError()
    }

    setSubmitting(true)
    const result = await signUp({
      email: email.trim(),
      password,
      captchaToken: captcha.token,
      consentedAt: new Date().toISOString(),
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
      <div>
        <div className="flex items-start gap-3">
          <input
            id="sign-up-consent"
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={
              errors.consent ? 'sign-up-consent-error' : undefined
            }
            className="mt-0.5 size-5 flex-none accent-accent"
          />
          <label
            htmlFor="sign-up-consent"
            className="text-[15px] leading-[1.5]"
          >
            I agree to the{' '}
            <Link to="/terms" target="_blank" className={TEXT_LINK}>
              Terms
            </Link>{' '}
            and{' '}
            <Link to="/privacy" target="_blank" className={TEXT_LINK}>
              Privacy Notice
            </Link>
            .
          </label>
        </div>
        {errors.consent && (
          <p id="sign-up-consent-error" className={FIELD_ERROR}>
            {errors.consent}
          </p>
        )}
      </div>
      <Turnstile onToken={captcha.onToken} resetKey={captcha.resetKey} />
      <button type="submit" disabled={submitting} className={PRIMARY_BUTTON}>
        {submitting ? 'Creating your account…' : 'Create account'}
      </button>
    </form>
  )
}
