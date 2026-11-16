import { Navigate, Outlet, useLocation } from 'react-router'
import AgeCheckDialog from './AgeCheckDialog.tsx'
import { useAuth } from './auth-context.ts'
import { signInPathFor, verifyPathFor } from './safe-next.ts'

/**
 * Layout route guarding every signed-in screen: signed-out visitors go to
 * sign-in (and come back afterwards), half-signed-in ones to the code screen.
 * Accounts that haven't confirmed they're 13 or older are asked first.
 */
export default function RequireAuth() {
  const { status, user } = useAuth()
  const { pathname, search, hash } = useLocation()

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground">
        <p role="status" className="text-[15px] text-muted">
          Loading…
        </p>
      </div>
    )
  }
  if (status === 'signed-out') {
    return <Navigate to={signInPathFor(pathname, search, hash)} replace />
  }
  if (status === 'needs-mfa') {
    return (
      <Navigate to={verifyPathFor(`${pathname}${search}${hash}`)} replace />
    )
  }
  return (
    <>
      <Outlet />
      {/* Strictly false: an offline-restored session (undefined) isn't asked. */}
      {status === 'signed-in' && user?.ageConfirmed === false && (
        <AgeCheckDialog />
      )}
    </>
  )
}
