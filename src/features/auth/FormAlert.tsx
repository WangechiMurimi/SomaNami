import type { ReactNode } from 'react'

/** A form-level message: `warn` for problems, `success` for confirmations. */
export default function FormAlert({
  tone = 'warn',
  children,
}: {
  tone?: 'warn' | 'success'
  children: ReactNode
}) {
  const colours =
    tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-success-soft text-success'
  return (
    <div
      role={tone === 'warn' ? 'alert' : 'status'}
      tabIndex={-1}
      className={`rounded-[10px] px-4 py-3 text-[14px] leading-[1.5] font-medium ${colours}`}
    >
      {children}
    </div>
  )
}
