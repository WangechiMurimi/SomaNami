import type { ReactNode } from 'react'

/** A form-level message: `warn` for problems, `success` for confirmations. */
export default function FormAlert({
  tone = 'warn',
  children,
}: {
  tone?: 'warn' | 'success'
  children: ReactNode
}) {
  // Wireframe (#142): a bordered box; the role and wording carry the tone.
  const border = tone === 'warn' ? 'border-2 border-warn' : 'border border-fg'
  return (
    <div
      role={tone === 'warn' ? 'alert' : 'status'}
      tabIndex={-1}
      className={`px-4 py-3 text-[14px] leading-[1.5] font-medium text-fg ${border}`}
    >
      {children}
    </div>
  )
}
