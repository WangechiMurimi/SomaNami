import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A modal dialog for a task (rename, add or remove sources, a first-use
 * question). Focus moves into it, stays inside, Escape closes it, and focus
 * returns to what opened it, so keyboard users land back where they were.
 * Without `onClose` it can't be dismissed: the user must pick an action.
 */
export default function Dialog({
  title,
  description,
  children,
  onClose,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  onClose?: () => void
}) {
  const id = useId()
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const autofocus =
      dialog.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      dialog.current?.querySelector<HTMLElement>(FOCUSABLE)
    autofocus?.focus()
    return () => opener?.focus?.()
  }, [])

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose?.()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (!focusable?.length) return
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-fg/40 p-4">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-description` : undefined}
        onKeyDown={handleKeyDown}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-xl"
      >
        <div className="flex flex-col gap-1.5">
          <h2 id={`${id}-title`} className="text-xl leading-[1.3] font-medium">
            {title}
          </h2>
          {description && (
            <p
              id={`${id}-description`}
              className="text-[0.9375rem] leading-[1.6] text-muted"
            >
              {description}
            </p>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

/** Button styles shared by the workspace dialogs. */
export const DIALOG_SECONDARY =
  'inline-flex h-11 items-center rounded-[10px] border border-edge px-[1.125rem] text-sm font-medium hover:bg-tint'
export const DIALOG_PRIMARY =
  'inline-flex h-11 items-center rounded-[10px] bg-accent px-[1.125rem] text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50'
