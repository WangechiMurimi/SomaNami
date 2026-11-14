import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { chatPath } from '../features/chat/conversation-materials.ts'
import { useRecentConversations } from '../features/chat/use-recent-conversations.ts'
import { useLibraryContext } from '../features/library/library-context.ts'
import { useOnline } from '../lib/connectivity/use-online.ts'

const RECENT_LIMIT = 3

const ICON = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const SECTION_LABEL =
  'text-[11px] leading-[1.5] font-medium tracking-[0.08em] text-muted uppercase'

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
          `flex h-[43px] items-center gap-[11px] rounded-[10px] px-3 text-sm transition-colors ${
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

function RecentChats() {
  const { conversations, status } = useRecentConversations(RECENT_LIMIT)

  return (
    <section aria-labelledby="recent-chats-title" className="mt-7 px-2.5">
      <h2 id="recent-chats-title" className={`${SECTION_LABEL} mb-3`}>
        Recent chats
      </h2>
      {status === 'ready' && conversations.length === 0 ? (
        <p className="text-xs leading-[18px] text-muted">
          Chats you start will appear here.
        </p>
      ) : (
        <ul className="flex flex-col gap-[9px]">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <NavLink
                to={chatPath(conversation)}
                className={({ isActive }) =>
                  `group flex items-center gap-2.5 rounded-md text-[13px] leading-[22px] ${
                    isActive
                      ? 'font-medium text-accent'
                      : 'text-muted hover:text-fg'
                  }`
                }
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 flex-none rounded-full bg-line group-aria-[current=page]:bg-accent"
                />
                <span className="min-w-0 truncate">{conversation.title}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/conversations"
        className="mt-3 inline-block text-xs leading-[18px] text-muted hover:text-accent hover:underline"
      >
        View all chats
      </Link>
    </section>
  )
}

function DeviceStatus() {
  const online = useOnline()
  return (
    <section
      aria-labelledby="device-status-title"
      className="rounded-xl border border-line bg-surface p-4"
    >
      <svg {...ICON} className="text-accent">
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M12 18h.01" />
      </svg>
      <h2 id="device-status-title" className="mt-3 text-[13px] font-semibold">
        On this device
      </h2>
      <p className="mt-2 text-xs leading-[18px] text-muted">
        Your materials and chats are saved to your account on this device and
        work offline. Asking new questions needs a connection.
      </p>
      <p
        className="mt-3 flex items-center gap-2 text-xs font-medium"
        role="status"
      >
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${online ? 'bg-online' : 'bg-warn'}`}
        />
        {online ? 'Online' : 'Offline — you can still read saved chats'}
      </p>
    </section>
  )
}

/**
 * There are no accounts (the PRD keeps everything on the device), so the
 * profile row says so instead of showing an invented name.
 */
function ProfileRow() {
  return (
    <div className="mt-5 flex items-center gap-[11px] border-t border-line px-2.5 pt-4">
      <span
        aria-hidden="true"
        className="flex size-[34px] flex-none items-center justify-center rounded-full bg-line text-fg"
      >
        <svg {...ICON} width={16} height={16}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      </span>
      <div className="min-w-0 leading-[1.5]">
        <p className="text-[13px] font-medium">Guest</p>
        <p className="text-xs text-muted">No account needed</p>
      </div>
    </div>
  )
}

/** Persistent navigation: brand, screens, recent chats and device status. */
export default function Sidebar() {
  const { documents } = useLibraryContext()

  return (
    <div className="flex h-full flex-col overflow-y-auto px-[18px] pt-[26px] pb-5">
      <Link
        to="/"
        className="flex items-center gap-[9px] self-start rounded-[10px] pl-[9px]"
      >
        <svg width="39" height="39" viewBox="0 0 39 39" aria-hidden="true">
          <rect width="39" height="39" rx="10" className="fill-accent" />
          <g
            transform="translate(9 9) scale(0.875)"
            fill="none"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-on-accent"
          >
            <path d="M12 7v14" />
            <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
          </g>
        </svg>
        <span className="font-brand text-2xl leading-[1.5] font-bold">
          SomaNami
        </span>
      </Link>

      <Link
        to="/workspaces/new"
        className="mt-7 flex h-10 items-center justify-center gap-[9px] rounded-lg bg-accent text-[13px] font-medium text-on-accent transition-opacity hover:opacity-90"
      >
        <svg {...ICON} width={15} height={15} strokeWidth={2.4}>
          <path d="M5 12h14M12 5v14" />
        </svg>
        New workspace
      </Link>

      <nav aria-label="Main" className="mt-7">
        <ul className="flex flex-col gap-1">
          <NavItem
            to="/"
            end
            icon={
              <svg {...ICON}>
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
              </svg>
            }
          >
            Home
          </NavItem>
          <NavItem
            to="/workspaces"
            icon={
              <svg {...ICON}>
                <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" />
                <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
              </svg>
            }
          >
            Workspaces
          </NavItem>
          <NavItem
            to="/library"
            icon={
              <svg {...ICON}>
                <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
              </svg>
            }
          >
            My library
            <span className="text-xs font-normal text-muted">
              <span className="sr-only">,</span> {documents.length}{' '}
              <span className="sr-only">materials</span>
            </span>
          </NavItem>
          <NavItem
            to="/conversations"
            icon={
              <svg {...ICON}>
                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
              </svg>
            }
          >
            Saved conversations
          </NavItem>
        </ul>
      </nav>

      <RecentChats />

      <div className="mt-auto pt-8">
        <DeviceStatus />
      </div>
      <ProfileRow />
    </div>
  )
}
