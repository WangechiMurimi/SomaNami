import type { ReactNode } from 'react'

/**
 * Wording the owner has not confirmed yet. Kept visible on purpose, so a
 * legal page can't ship looking finished while it still guesses.
 */
export default function OwnerToConfirm({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded bg-warn-soft px-1 text-warn">
      [CONFIRM: {children}]
    </mark>
  )
}
