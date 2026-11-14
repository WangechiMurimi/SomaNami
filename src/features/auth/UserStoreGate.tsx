import type { ReactNode } from 'react'

/**
 * Opens the signed-in user's private local store before rendering anything
 * that reads storage, and closes it on sign-out or a user switch.
 * TODO(#114): WS-D implements this with `openUserStore` / `closeUserStore`.
 */
export default function UserStoreGate({ children }: { children: ReactNode }) {
  return children
}
