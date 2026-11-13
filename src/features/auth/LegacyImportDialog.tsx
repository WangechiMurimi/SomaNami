import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { H2 } from '../../pages/page-heading.ts'

const BUTTON =
  'inline-flex h-11 items-center justify-center rounded-[10px] px-[18px] text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60'

interface LegacyImportDialogProps {
  /** Moves the materials; rejects if they could not all be moved. */
  onMove: () => Promise<void>
  /** Leaves the materials where they are and stops asking this user. */
  onLeave: () => void
  /** Closes without choosing, so the question comes back next time. */
  onLater: () => void
}

/**
 * Offers to move materials saved before accounts existed into the signed-in
 * user's store. It is the only thing on screen until a choice is made, so the
 * library never loads half-moved materials.
 */
export default function LegacyImportDialog({
  onMove,
  onLeave,
  onLater,
}: LegacyImportDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const moveButton = useRef<HTMLButtonElement>(null)
  const [moving, setMoving] = useState(false)
  const [failed, setFailed] = useState(false)

  // Esc is "not now": it must never trigger either choice, and it can't
  // interrupt a move that is already running.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || moving) return
      event.preventDefault()
      onLater()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [moving, onLater])

  // Keeps Tab cycling through the dialog's own controls.
  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !dialog.current) return
    const focusable = [
      ...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled])'),
    ]
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) return event.preventDefault()
    const active = document.activeElement
    if (
      event.shiftKey &&
      (active === first || !dialog.current.contains(active))
    ) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const move = async () => {
    setMoving(true)
    setFailed(false)
    try {
      await onMove()
    } catch {
      setFailed(true)
      setMoving(false)
      // Disabling the button dropped focus; give it back so a retry is one key away.
      requestAnimationFrame(() => moveButton.current?.focus())
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ground px-4 py-8">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={trapFocus}
        className="w-full max-w-[34rem] rounded-2xl border border-line bg-surface p-6 text-fg md:p-8"
      >
        <h2 id={titleId} className={H2}>
          Move the materials already on this device into your account?
        </h2>
        <p
          id={descriptionId}
          className="mt-3 text-[15px] leading-[1.6] text-muted"
        >
          Documents and conversations were saved on this device before you
          signed in. Moving them puts them in your library. They stay on this
          device either way; nothing is uploaded. If you leave them aside, they
          stay where they are and you won’t be asked again.
        </p>

        {failed && (
          <p
            role="alert"
            className="mt-4 rounded-[10px] bg-warn-soft px-4 py-3 text-sm leading-[1.5] text-warn"
          >
            We couldn’t move them. Your materials are still on this device,
            untouched. Try again, or leave them aside for now.
          </p>
        )}

        {/* Primary first in the DOM (and on top when stacked), rightmost when in a row. */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse sm:justify-start">
          <button
            ref={moveButton}
            type="button"
            onClick={move}
            disabled={moving}
            // The recommended choice, and focus has nowhere else to start.
            autoFocus
            className={`${BUTTON} bg-accent text-on-accent hover:opacity-90`}
          >
            {moving ? 'Moving…' : 'Move them'}
          </button>
          <button
            type="button"
            onClick={onLeave}
            disabled={moving}
            className={`${BUTTON} border border-edge text-fg hover:bg-tint`}
          >
            Leave them aside
          </button>
        </div>
      </div>
    </div>
  )
}
