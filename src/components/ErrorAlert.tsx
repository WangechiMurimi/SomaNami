import type { ReactNode } from 'react'

/**
 * A page-level error on a warning tint, announced as an alert. Pages differ
 * in corner radius and padding, so those come in through `className`.
 */
export default function ErrorAlert({
  children,
  className = 'rounded-[10px] p-4',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p role="alert" className={`${className} bg-warn-soft text-warn`}>
      {children}
    </p>
  )
}
