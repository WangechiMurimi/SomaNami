import type { ReactNode } from 'react'

/** A page-level loading message, announced to screen readers. */
export default function Loading({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="text-muted">
      {children}
    </p>
  )
}
