import { useState } from 'react'
import FormAlert from './FormAlert.tsx'
import { useAuth } from './auth-context.ts'
import { authErrorMessage } from './auth-errors.ts'
import { PRIMARY_BUTTON } from './auth-ui.ts'

/**
 * "Continue with Google", the main way in, with an "or" rule before the
 * email form that follows it. Google handles its own 2-step checks.
 */
export default function GoogleSignIn({ next = '/' }: { next?: string }) {
  const { signInWithGoogle } = useAuth()
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setError(null)
    setLeaving(true)
    const result = await signInWithGoogle(next)
    // On success the browser is already on its way to Google.
    if (!result.ok) {
      setLeaving(false)
      setError(authErrorMessage(result.error))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <FormAlert>{error}</FormAlert>}
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={leaving}
        className={PRIMARY_BUTTON}
      >
        {leaving ? 'Opening Google…' : 'Continue with Google'}
      </button>
      <p className="flex items-center gap-3 text-[13px] text-muted">
        <span aria-hidden="true" className="h-px flex-1 bg-edge" />
        or use your email
        <span aria-hidden="true" className="h-px flex-1 bg-edge" />
      </p>
    </div>
  )
}
