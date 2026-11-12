import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

/**
 * A modal confirmation. Focus starts on Cancel (the safe choice), stays inside
 * the dialog, Escape cancels, and focus returns to what opened it.
 */
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const id = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    cancel.current?.focus()
    return () => opener?.focus?.()
  }, [])

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCancel()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = dialog.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href]',
    )
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
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        onKeyDown={handleKeyDown}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-xl"
      >
        <h2 id={`${id}-title`} className="text-xl leading-[1.3] font-medium">
          {title}
        </h2>
        <div id={`${id}-body`} className="text-[15px] leading-[1.6] text-muted">
          {children}
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            ref={cancel}
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center rounded-[10px] border border-edge px-[18px] text-sm font-medium hover:bg-tint"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-11 items-center rounded-[10px] bg-warn px-[18px] text-sm font-medium text-surface hover:opacity-90 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
