import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import AuthLayout from '../features/auth/AuthLayout.tsx'
import FormAlert from '../features/auth/FormAlert.tsx'
import TextField from '../features/auth/TextField.tsx'
import { useAuth } from '../features/auth/auth-context.ts'
import {
  authErrorMessage,
  toAuthErrorCode,
} from '../features/auth/auth-errors.ts'
import {
  AUTH_FOOTER,
  CHECKBOX,
  CHECKBOX_ROW,
  FIELD_ERROR,
  SUBMIT_BUTTON,
  TEXT_LINK,
} from '../features/auth/auth-ui.ts'
import { rememberCompletedProfile } from '../features/auth/completed-profile.ts'
import { safeNextPath } from '../features/auth/safe-next.ts'
import { useFocusFirstError } from '../features/auth/use-focus-first-error.ts'
import {
  getProfile,
  MAX_DISPLAY_NAME,
  saveProfile,
} from '../lib/auth/profile.ts'

interface FieldErrors {
  displayName?: string
  age?: string
}

/**
 * The details step after creating an account: a display name and a yes/no
 * "13 or older". Only that answer is stored, never a birth date. Signed-in
 * only; `RequireProfile` sends every incomplete account here.
 */
export default function DetailsPage() {
  const { status, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const { formRef, reportError } = useFocusFirstError<HTMLFormElement>()
  const [displayName, setDisplayName] = useState('')
  const [age13Plus, setAge13Plus] = useState(false)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const userId = user?.id ?? null
  const suggestedName = user?.name ?? ''
  const online = status === 'signed-in'

  // Prefill from a row saved earlier, so an account missing one answer only
  // has to give that one, else from Google's name (only a starting point).
  // The form stays hidden until then, so nothing typed is overwritten.
  useEffect(() => {
    if (!online || userId === null) return
    let active = true
    getProfile(userId)
      .catch(() => null)
      .then((profile) => {
        if (!active) return
        setDisplayName(profile?.displayName || suggestedName)
        setAge13Plus(profile?.age13Plus ?? false)
        setLoadedFor(userId)
      })
    return () => {
      active = false
    }
  }, [online, userId, suggestedName])

  if (!online || userId === null) {
    return (
      <AuthLayout title="A few details">
        <FormAlert>{authErrorMessage('offline')}</FormAlert>
      </AuthLayout>
    )
  }

  if (loadedFor !== userId) {
    return (
      <AuthLayout title="A few details">
        <p role="status" className="text-[15px] text-muted">
          Loading…
        </p>
      </AuthLayout>
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (userId === null) return
    const errors: FieldErrors = {}
    if (!displayName.trim()) {
      errors.displayName = 'Enter the name you’d like SomaNami to use.'
    }
    if (!age13Plus) {
      errors.age = 'SomaNami is for learners 13 and older.'
    }
    setFieldErrors(errors)
    setFormError(null)
    if (errors.displayName || errors.age) return reportError()

    setSubmitting(true)
    try {
      await saveProfile(userId, { displayName, age13Plus })
    } catch (error) {
      setSubmitting(false)
      setFormError(authErrorMessage(toAuthErrorCode(error)))
      return reportError()
    }
    rememberCompletedProfile(userId)
    navigate(next, { replace: true })
  }

  return (
    <AuthLayout
      title="A few details"
      lede="Your account is ready. Tell us what to call you."
    >
      <form
        ref={formRef}
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        {formError && <FormAlert>{formError}</FormAlert>}
        <TextField
          id="details-name"
          label="Display name"
          name="name"
          autoComplete="name"
          maxLength={MAX_DISPLAY_NAME}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          error={fieldErrors.displayName}
        />
        <div>
          <div className={CHECKBOX_ROW}>
            <input
              id="details-age"
              type="checkbox"
              checked={age13Plus}
              onChange={(e) => setAge13Plus(e.target.checked)}
              aria-invalid={fieldErrors.age ? true : undefined}
              aria-describedby={
                fieldErrors.age ? 'details-age-error' : undefined
              }
              className={CHECKBOX}
            />
            <label htmlFor="details-age">I’m 13 or older</label>
          </div>
          {fieldErrors.age && (
            <p id="details-age-error" className={FIELD_ERROR}>
              {fieldErrors.age}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={submitting}
          className={`${SUBMIT_BUTTON} mt-2`}
        >
          {submitting ? 'Saving…' : 'Continue'}
        </button>
      </form>
      <p className={AUTH_FOOTER}>
        Not you?{' '}
        <button
          type="button"
          onClick={() => void signOut()}
          className={TEXT_LINK}
        >
          Sign out
        </button>
      </p>
    </AuthLayout>
  )
}
