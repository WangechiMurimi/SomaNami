import { useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import ThemeToggle from '../components/ThemeToggle.tsx'
import AccountMenu from '../features/auth/AccountMenu.tsx'
import Sidebar from './Sidebar.tsx'

/**
 * The layout every screen shares: sidebar, top bar and the main column. Below
 * the md breakpoint the sidebar collapses behind a menu button.
 */
export default function AppShell() {
  const { pathname } = useLocation()
  // The page the menu was opened on: navigating anywhere closes it, with no
  // effect needed to reset state after the route changes.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const menuOpen = openOn === pathname
  const setMenuOpen = (open: boolean) => setOpenOn(open ? pathname : null)

  return (
    <div className="flex min-h-screen bg-ground text-fg">
      <aside
        id="app-sidebar"
        aria-label="Sidebar"
        className={`${
          menuOpen ? 'fixed inset-y-0 left-0 z-20 flex' : 'hidden'
        } w-[260px] flex-none flex-col border-r border-line bg-side md:static md:flex`}
      >
        <Sidebar />
      </aside>
      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-10 bg-fg/30 md:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-20 items-center justify-between gap-6 px-4 pt-5 md:justify-end md:px-12">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="app-sidebar"
            onClick={() => setMenuOpen(true)}
            className="inline-flex size-11 items-center justify-center rounded-[10px] text-fg hover:bg-tint md:hidden"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <AccountMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1376px] px-4 pt-8 pb-24 md:px-12 md:pt-16">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
