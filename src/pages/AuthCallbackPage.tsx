import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import AuthLayout from '../features/auth/AuthLayout.tsx'
import FormAlert from '../features/auth/FormAlert.tsx'
import { useAuth } from '../features/auth/auth-context.ts'
import {
  authErrorMessage,
  redirectErrorCode,
} from '../features/auth/auth-errors.ts'
import { TEXT_LINK } from '../features/auth/auth-ui.ts'
import { safeNextPath } from '../features/auth/safe-next.ts'
import type { AuthErrorCode } from '../types/auth.ts'

/**
 * Public route every Google, confirmation and recovery link returns to. It
 * exchanges the one-time `?code=` for a session, then opens a safe `next`;
 * RequireProfile sends a new account on to the details step from there.
 */
export default function AuthCallbackPage() {
  const { status, exchangeCode } = useAuth()
  const { search, hash } = useLocation()
  const params = new URLSearchParams(search)
  const code = params.get('code')
  const next = safeNextPath(params.get('next'))
  // Supabase reports failures in the query, or the fragment for older links.
  const reported =
    redirectErrorCode(params) ??
    redirectErrorCode(new URLSearchParams(hash.slice(1)))
  const [failure, setFailure] = useState<AuthErrorCode | null>(null)
  const [done, setDone] = useState(false)
  // A code works once; React may run this effect twice in development.
  const started = useRef(false)

  useEffect(() => {
    // Waiting for the saved-session check keeps it from landing after the
    // exchange and reporting the old (signed-out) state.
    if (started.current || !code || reported || status === 'loading') return
    started.current = true
    void exchangeCode(code).then((result) =>
      result.ok ? setDone(true) : setFailure(result.error),
    )
  }, [code, reported, status, exchangeCode])

  const signedIn = status === 'signed-in' || status === 'signed-in-offline'
  const error =
    reported ?? failure ?? (!code && !signedIn ? 'link-expired' : null)

  if (error) {
    return (
      <AuthLayout title="We couldn’t sign you in">
        <div className="flex flex-col gap-6">
          <FormAlert>{authErrorMessage(error)}</FormAlert>
          <Link to="/sign-in" className={TEXT_LINK}>
            Go to sign in
          </Link>
        </div>
      </AuthLayout>
    )
  }
  // Replace, so the spent code never stays in history.
  if (done || (!code && signedIn)) return <Navigate to={next} replace />

  return (
    <AuthLayout title="Signing you in">
      <p role="status" className="text-[0.9375rem] text-muted">
        One moment…
      </p>
    </AuthLayout>
  )
}
