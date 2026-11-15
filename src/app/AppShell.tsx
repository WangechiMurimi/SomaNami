import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { BreadcrumbContext, type Crumb } from './breadcrumbs.ts'
import Sidebar from './Sidebar.tsx'
import { useSidebarCollapsed } from './sidebar-preference.ts'

const ICON = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const TOP_BUTTON =
  'inline-flex size-11 flex-none items-center justify-center rounded-[10px] text-fg hover:bg-tint'

function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length === 0) return null
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-[5px] text-[15px] leading-[1.5] text-muted">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            <li key={index} className="flex min-w-0 items-center gap-[5px]">
              {index > 0 && <span aria-hidden="true">/</span>}
              {last || !crumb.to ? (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={`truncate ${last ? 'text-fg' : ''}`}
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  to={crumb.to}
                  className="truncate hover:text-accent hover:underline"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * The layout every screen shares: sidebar, top bar and the main column. On
 * wide screens the sidebar collapses to an icon rail and remembers that
 * choice; below the md breakpoint it opens as an overlay drawer instead.
 */
export default function AppShell() {
  const { pathname } = useLocation()
  // The page the menu was opened on: navigating anywhere closes it, with no
  // effect needed to reset state after the route changes.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const menuOpen = openOn === pathname
  const setMenuOpen = (open: boolean) => setOpenOn(open ? pathname : null)
  const [collapsed, setCollapsed] = useSidebarCollapsed()
  // The drawer always shows the full sidebar; the rail is a wide-screen view.
  const rail = collapsed && !menuOpen
  const [crumbs, setCrumbs] = useState<Crumb[]>([])

  return (
    <BreadcrumbContext value={setCrumbs}>
      <div className="flex min-h-screen bg-ground text-fg">
        <aside
          id="app-sidebar"
          aria-label="Sidebar"
          className={`${
            menuOpen ? 'fixed inset-y-0 left-0 z-20 flex' : 'hidden'
          } ${
            rail ? 'w-20' : 'w-[260px]'
          } flex-none flex-col border-r border-line bg-side md:sticky md:top-0 md:flex md:h-screen`}
        >
          <Sidebar rail={rail} />
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
          <header className="flex h-20 items-center gap-2 px-4 pt-5 md:pr-12 md:pl-9">
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="app-sidebar"
              onClick={() => setMenuOpen(true)}
              className={`${TOP_BUTTON} md:hidden`}
            >
              <svg {...ICON} width="22" height="22" strokeWidth="1.8">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              aria-controls="app-sidebar"
              onClick={() => setCollapsed(!collapsed)}
              className={`${TOP_BUTTON} hidden md:inline-flex`}
            >
              <svg {...ICON} width="22" height="22" strokeWidth="1.7">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
              </svg>
            </button>
            <Breadcrumbs crumbs={crumbs} />
            <Link
              to="/help"
              className="ml-auto inline-flex h-11 flex-none items-center gap-[7px] rounded-[10px] px-2 text-[15px] text-fg hover:text-accent"
            >
              <svg {...ICON} width="22" height="22" strokeWidth="1.7">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <path d="M12 17h.01" />
              </svg>
              Help
            </Link>
          </header>
          <main className="mx-auto w-full max-w-[1376px] px-4 pt-8 pb-24 md:px-12 md:pt-12">
            <Outlet />
          </main>
        </div>
      </div>
    </BreadcrumbContext>
  )
}
