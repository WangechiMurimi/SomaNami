import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { useLibraryContext } from '../features/library/library-context.ts'
import { useOnline } from '../lib/connectivity/use-online.ts'

const ICON = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function NavItem({
  to,
  icon,
  children,
  end = false,
}: {
  to: string
  icon: ReactNode
  children: ReactNode
  end?: boolean
}) {
  return (
    <li>
      {/* NavLink sets aria-current="page" on the active route. */}
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          `flex h-[43px] items-center gap-[11px] rounded-[10px] pr-3 pl-3 text-sm transition-colors ${
            isActive
              ? 'bg-tint font-semibold text-accent'
              : 'text-muted hover:bg-tint/60 hover:text-fg'
          }`
        }
      >
        {icon}
        <span className="flex flex-1 items-center justify-between gap-2">
          {children}
        </span>
      </NavLink>
    </li>
  )
}

function DeviceStatus() {
  const online = useOnline()
  return (
    <section
      aria-labelledby="device-status-title"
      className="rounded-xl border border-line bg-surface p-4"
    >
      <h2 id="device-status-title" className="text-[13px] font-semibold">
        On this device
      </h2>
      <p className="mt-2 text-xs leading-[18px] text-muted">
        Your materials and chats are saved here and work offline. Asking new
        questions needs a connection.
      </p>
      <p className="mt-3 flex items-center gap-2 text-xs" role="status">
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${online ? 'bg-online' : 'bg-warn'}`}
        />
        {online ? 'Online' : 'Offline — you can still read saved chats'}
      </p>
    </section>
  )
}

/** Persistent navigation: brand, the screens that exist, and device status. */
export default function Sidebar() {
  const { documents } = useLibraryContext()

  return (
    <div className="flex h-full flex-col px-[18px] pt-[26px] pb-5">
      <NavLink
        to="/"
        className="flex items-center gap-3 self-start rounded-[10px] pl-[9px]"
      >
        <svg width="39" height="39" viewBox="0 0 39 39" aria-hidden="true">
          <rect width="39" height="39" rx="10" className="fill-accent" />
          <path
            d="M11 13.5c2.6-1 5.2-1 8.5.8 3.3-1.8 5.9-1.8 8.5-.8v12c-2.6-1-5.2-1-8.5.8-3.3-1.8-5.9-1.8-8.5-.8z M19.5 14.3v12"
            fill="none"
            strokeWidth="1.6"
            strokeLinejoin="round"
            className="stroke-on-accent"
          />
        </svg>
        <span className="font-brand text-2xl leading-[1.5] font-bold">
          SomaNami
        </span>
      </NavLink>

      <nav aria-label="Main" className="mt-7">
        <ul className="flex flex-col gap-1">
          <NavItem
            to="/"
            end
            icon={
              <svg {...ICON}>
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
            }
          >
            Home
          </NavItem>
          <NavItem
            to="/library"
            icon={
              <svg {...ICON}>
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
            }
          >
            My library
            <span className="text-xs font-normal text-muted">
              <span className="sr-only">, </span>
              {documents.length}
              <span className="sr-only"> materials</span>
            </span>
          </NavItem>
        </ul>
      </nav>

      <div className="mt-auto pt-8">
        <DeviceStatus />
      </div>
    </div>
  )
}
