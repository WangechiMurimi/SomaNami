import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './auth-context.ts'
import { signInPathFor } from './safe-next.ts'

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
    return <Navigate to={signInPathFor(pathname, search, hash)} replace />
  }
  if (status === 'needs-mfa') {
    const signIn = signInPathFor(pathname, search, hash)
    return (
      <Navigate to={signIn.replace('/sign-in', '/sign-in/verify')} replace />
    )
  }
  return <Outlet />
}
