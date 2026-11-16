import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { getProfile, isProfileComplete } from '../../lib/auth/profile.ts'
import { useAuth } from './auth-context.ts'
import {
  hasCompletedProfile,
  rememberCompletedProfile,
} from './completed-profile.ts'
import { detailsPathFor } from './safe-next.ts'

type Check = {
  userId: string
  result: 'complete' | 'incomplete' | 'failed'
} | null

/**
 * Layout route inside `RequireAuth`: a signed-in user without a complete
 * profile goes to the details step first. This also catches accounts made
 * before profiles existed, so they need no backfill. Offline the check is
 * skipped, so learners can keep reading their materials (US-07).
 */
export default function RequireProfile() {
  const { status, user } = useAuth()
  const { pathname, search, hash } = useLocation()
  const [check, setCheck] = useState<Check>(null)
  const [attempt, setAttempt] = useState(0)

  const userId = user?.id ?? null
  const known = userId !== null && hasCompletedProfile(userId)
  const skip =
    status === 'signed-in-offline' || (status === 'signed-in' && known)
  const needsCheck = status === 'signed-in' && userId !== null && !known

  useEffect(() => {
    if (!needsCheck || userId === null) return
    let active = true
    getProfile(userId).then(
      (profile) => {
        if (!active) return
        const complete = isProfileComplete(profile)
        if (complete) rememberCompletedProfile(userId)
        setCheck({ userId, result: complete ? 'complete' : 'incomplete' })
      },
      () => {
        if (active) setCheck({ userId, result: 'failed' })
      },
    )
    return () => {
      active = false
    }
  }, [needsCheck, userId, attempt])

  if (skip) return <Outlet />

  // RequireAuth already holds back loading and signed-out visitors; waiting
  // here too keeps the gate safe wherever it is mounted.
  const result = needsCheck && check?.userId === userId ? check.result : null
  if (result === 'complete') return <Outlet />
  if (result === 'incomplete') {
    return (
      <Navigate to={detailsPathFor(`${pathname}${search}${hash}`)} replace />
    )
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ground px-4 text-center">
      {result === 'failed' ? (
        <>
          <p role="alert" className="text-[15px] text-fg">
            We couldn’t load your account details.
          </p>
          <button
            type="button"
            onClick={() => {
              setCheck(null)
              setAttempt((n) => n + 1)
            }}
            className="text-[15px] font-medium text-accent underline underline-offset-2"
          >
            Try again
          </button>
        </>
      ) : (
        <p role="status" className="text-[15px] text-muted">
          Loading…
        </p>
      )}
    </div>
  )
}
