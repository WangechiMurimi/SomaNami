import { Outlet } from 'react-router'

/**
 * Layout route guarding every signed-in screen.
 * TODO(#114): WS-B sends `signed-out` to `/sign-in?next=…` and `needs-mfa` to
 * `/sign-in/verify`; it renders the screens for `signed-in` and `signed-in-offline`.
 */
export default function RequireAuth() {
  return <Outlet />
}
