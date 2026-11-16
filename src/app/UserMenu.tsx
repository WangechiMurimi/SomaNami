import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../features/auth/auth-context.ts'
import {
  LEAVE_MESSAGES,
  OTHER_TABS_MESSAGE,
  useLeaveDevice,
} from '../features/sync/use-leave-device.ts'
import { initialsFor } from './initials.ts'

const ITEM =
  'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-fg hover:bg-tint focus-visible:bg-tint'

const ICON = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: 'flex-none text-muted',
}

/**
 * The signed-in account at the foot of the sidebar. Opens a small menu with
 * Account settings and Log out, so logging out never needs a trip through
 * Settings. In the collapsed rail only the avatar shows.
 */
export default function UserMenu({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth()
  // Saves changes first and stops with a reason rather than lose them (#147).
  const { leave, busy, problem, waitingForTabs } = useLeaveDevice()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const items = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    )

  // Moving focus into the menu is what lets arrow keys and Escape work at once.
  useEffect(() => {
    if (open)
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  if (!user) return null
  const email = user.email || 'Your account'

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function onMenuKeyDown(event: KeyboardEvent) {
    const list = items()
    const index = list.indexOf(document.activeElement as HTMLElement)
    const focusAt = (next: number) =>
      list[(next + list.length) % list.length]?.focus()
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        close()
        break
      case 'ArrowDown':
        event.preventDefault()
        focusAt(index + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusAt(index - 1)
        break
      case 'Home':
        event.preventDefault()
        focusAt(0)
        break
      case 'End':
        event.preventDefault()
        focusAt(list.length - 1)
        break
      case 'Tab':
        // Tab leaves the menu as it would any other control; the menu closes.
        setOpen(false)
        break
    }
  }

  function logOut() {
    setOpen(false)
    // Signing out sends RequireAuth to the sign-in page; no navigate needed.
    void leave('local')
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        // Starts with the visible text, so voice control can find it.
        aria-label={`${email}, account menu`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={compact ? email : undefined}
        onClick={() => setOpen(!open)}
        className={`flex min-h-11 w-full items-center gap-[11px] rounded-[10px] py-1.5 text-left hover:bg-tint ${
          compact ? 'justify-center px-0' : 'px-2.5'
        } ${open ? 'bg-tint' : ''}`}
      >
        <span
          aria-hidden="true"
          className="flex size-[34px] flex-none items-center justify-center rounded-full bg-line text-[11px] font-semibold text-fg"
        >
          {initialsFor(user.email)}
        </span>
        {!compact && (
          <>
            <span className="min-w-0 flex-1 truncate text-[13px] leading-[1.5] font-medium">
              {email}
            </span>
            <svg {...ICON}>
              <path d="m7 15 5 5 5-5" />
              <path d="m7 9 5-5 5 5" />
            </svg>
          </>
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className={`absolute z-30 flex flex-col gap-0.5 rounded-xl border border-line bg-surface p-1.5 shadow-lg ${
            compact
              ? 'bottom-0 left-full ml-3 w-56'
              : 'inset-x-0 bottom-full mb-2'
          }`}
        >
          <Link
            to="/account"
            role="menuitem"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className={ITEM}
          >
            <svg {...ICON}>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
            Account settings
          </Link>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={busy}
            onClick={logOut}
            className={`${ITEM} disabled:opacity-60`}
          >
            <svg {...ICON}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            Log out
          </button>
        </div>
      )}
      {/* Outside the menu, which closes on click, so the reason stays visible. */}
      {busy && (
        <p role="status" className="px-2.5 pt-1 text-[13px] text-muted">
          Saving and signing out…
        </p>
      )}
      {problem && (
        <p role="alert" className="px-2.5 pt-1 text-[13px] text-warn">
          {LEAVE_MESSAGES[problem]}
        </p>
      )}
      {waitingForTabs && (
        <p role="status" className="px-2.5 pt-1 text-[13px] text-muted">
          {OTHER_TABS_MESSAGE}
        </p>
      )}
    </div>
  )
}
