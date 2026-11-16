import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { MoreVertical } from './workspace-icons.tsx'

export type WorkspaceAction =
  'open' | 'add-sources' | 'remove-sources' | 'rename' | 'pin' | 'delete'

/**
 * The vertical-dots menu on a workspace card. Follows the menu button
 * pattern: arrow keys move between items, Escape closes and returns focus to
 * the button, and choosing an item hands focus back to the button first so a
 * dialog opened from it can return focus there.
 */
export default function WorkspaceMenu({
  name,
  pinned,
  onSelect,
  className = 'relative',
}: {
  name: string
  pinned: boolean
  onSelect: (action: WorkspaceAction) => void
  className?: string
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLUListElement>(null)

  const items: { action: WorkspaceAction; label: string }[] = [
    { action: 'open', label: 'Open' },
    { action: 'add-sources', label: 'Add sources' },
    { action: 'remove-sources', label: 'Remove sources' },
    { action: 'rename', label: 'Rename' },
    { action: 'pin', label: pinned ? 'Unpin' : 'Pin' },
    { action: 'delete', label: 'Delete' },
  ]

  const menuItems = () =>
    Array.from(
      menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    )

  useEffect(() => {
    if (!open) return
    menuItems()[0]?.focus()
    // A click anywhere else closes the menu, as native menus do.
    const close = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !menu.current?.contains(target) &&
        !button.current?.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const closeAndFocusButton = () => {
    setOpen(false)
    button.current?.focus()
  }

  const choose = (action: WorkspaceAction) => {
    closeAndFocusButton()
    onSelect(action)
  }

  const handleMenuKeyDown = (event: KeyboardEvent) => {
    const all = menuItems()
    const index = all.indexOf(document.activeElement as HTMLElement)
    const focusAt = (next: number) =>
      all[(next + all.length) % all.length]?.focus()
    switch (event.key) {
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
        focusAt(all.length - 1)
        break
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        closeAndFocusButton()
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  return (
    // The wrapper positions the popup, so `className` must keep it positioned.
    <div className={className}>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-label={`Actions for ${name}`}
        onClick={() => setOpen((shown) => !shown)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            setOpen(true)
          }
        }}
        className="flex size-11 items-center justify-center rounded-[10px] text-muted hover:bg-tint hover:text-fg aria-expanded:bg-tint aria-expanded:text-fg"
      >
        <MoreVertical size={18} strokeWidth={2.4} />
      </button>
      {open && (
        <ul
          ref={menu}
          id={`${id}-menu`}
          role="menu"
          aria-label={`Actions for ${name}`}
          onKeyDown={handleMenuKeyDown}
          className="absolute top-[calc(100%+4px)] right-0 z-20 flex w-48 flex-col rounded-xl border border-line bg-surface p-1.5 shadow-lg"
        >
          {items.map(({ action, label }) => (
            <li key={action} role="none">
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => choose(action)}
                className={`flex h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium outline-none hover:bg-tint focus:bg-tint ${
                  action === 'delete' ? 'text-warn' : 'text-fg'
                }`}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
