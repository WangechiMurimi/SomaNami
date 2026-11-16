import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './auth-context.ts'
import { signInPathFor, verifyPathFor } from './safe-next.ts'
import { clearSigningOut, isSigningOut } from './sign-out-intent.ts'

/**
 * Layout route guarding every signed-in screen: signed-out visitors go to
 * sign-in (and come back afterwards), half-signed-in ones to the code screen.
 */
export default function RequireAuth() {
  const { status } = useAuth()
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
    // After choosing to sign out there's nowhere to come back to.
    const to = isSigningOut()
      ? '/sign-in'
      : signInPathFor(pathname, search, hash)
    return <Navigate to={to} replace />
  }
  if (status === 'needs-mfa') {
    return (
      <Navigate to={verifyPathFor(`${pathname}${search}${hash}`)} replace />
    )
  }
  clearSigningOut()
  return <Outlet />
}
