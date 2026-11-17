import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './auth-context.ts'
import { signInPathFor } from './safe-next.ts'
import { clearSigningOut, isSigningOut } from './sign-out-intent.ts'

/**
 * Layout route guarding every signed-in screen: signed-out visitors go to
 * sign-in, and come back afterwards.
 */
export default function RequireAuth() {
  const { status } = useAuth()
  const { pathname, search, hash } = useLocation()

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground">
        <p role="status" className="text-[0.9375rem] text-muted">
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
  clearSigningOut()
  return <Outlet />
}
