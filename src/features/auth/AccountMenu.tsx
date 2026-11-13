import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from './auth-context.ts'

/**
 * Header button showing who is signed in, opening a small panel with the
 * Account link and Sign out. A disclosure rather than an ARIA menu, so it
 * works with plain Tab and Enter.
 */
export default function AccountMenu() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const panelId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  // Remember where it opened, so navigating anywhere closes it.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpenOn(null)
      button.current?.focus()
    }
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpenOn(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  if (!user) return null
  const email = user.email || 'Your account'
  const initial = (user.email[0] ?? '?').toUpperCase()

  async function handleSignOut() {
    await signOut()
    navigate('/sign-in', { replace: true })
  }

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        // Includes the visible email, so voice control can target it by name.
        aria-label={`Account menu, signed in as ${email}`}
        onClick={() => setOpenOn(open ? null : pathname)}
        className="inline-flex h-11 max-w-[16rem] items-center gap-2.5 rounded-[10px] pr-3 pl-1.5 text-sm text-fg transition-colors hover:bg-tint"
      >
        <span
          aria-hidden="true"
          className="inline-flex size-8 flex-none items-center justify-center rounded-full bg-tint font-semibold text-accent"
        >
          {initial}
        </span>
        <span aria-hidden="true" className="hidden truncate sm:inline">
          {email}
        </span>
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 z-30 mt-2 w-64 rounded-[12px] border border-line bg-surface p-2 shadow-[0_8px_24px_rgb(0_0_0/0.12)]"
        >
          <p className="truncate px-3 pt-1 pb-2 text-[13px] text-muted">
            Signed in as
            <span className="block truncate font-medium text-fg">{email}</span>
          </p>
          <Link
            to="/account"
            className="flex h-11 items-center rounded-[10px] px-3 text-sm text-fg hover:bg-tint"
          >
            Account
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex h-11 w-full items-center rounded-[10px] px-3 text-left text-sm text-fg hover:bg-tint"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
