import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import BrandMark from '../components/BrandMark.tsx'
import { chatPath } from '../features/chat/conversation-materials.ts'
import { useRecentConversations } from '../features/chat/use-recent-conversations.ts'
import { useLibraryContext } from '../features/library/library-context.ts'
import { isLooseWorkspace } from '../lib/storage/index.ts'
import UserMenu from './UserMenu.tsx'

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
  label,
  children = label,
  end = false,
  rail,
}: {
  to: string
  icon: ReactNode
  /** Plain name, shown as the tooltip in the rail. */
  label: string
  children?: ReactNode
  end?: boolean
  rail: boolean
}) {
  return (
    <li>
      {/* NavLink sets aria-current="page" on the active route. */}
      <NavLink
        to={to}
        end={end}
        title={rail ? label : undefined}
        className={({ isActive }) =>
          `flex h-[43px] items-center gap-[11px] rounded-[10px] text-sm transition-colors ${
            rail ? 'justify-center' : 'px-3'
          } ${
            isActive
              ? 'bg-tint font-semibold text-accent'
              : 'text-muted hover:bg-tint/60 hover:text-fg'
          }`
        }
      >
        {icon}
        {/* The rail keeps the name for screen readers and voice control. */}
        <span
          className={
            rail ? 'sr-only' : 'flex flex-1 items-center justify-between gap-2'
          }
        >
          {children}
        </span>
      </NavLink>
    </li>
  )
}

/**
 * Loose chats only, newest first. Chats inside a workspace stay with that
 * workspace, so Recents never lists them.
 */
function Recents() {
  const { conversations, status } = useRecentConversations()
  const loose = conversations
    .filter(({ workspaceId }) => isLooseWorkspace(workspaceId))
    .slice(0, RECENT_LIMIT)

  return (
    <section aria-labelledby="recents-title" className="mt-7 px-2.5">
      <h2 id="recents-title" className={`${SECTION_LABEL} mb-3`}>
        Recents
      </h2>
      {status === 'ready' && loose.length === 0 ? (
        <p className="text-xs leading-[18px] text-muted">
          Chats you start from Home will appear here.
        </p>
      ) : (
        <ul className="flex flex-col gap-[9px]">
          {loose.map((conversation) => (
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
    </section>
  )
}

/**
 * Persistent navigation: brand, screens, Recents and the account menu. As a
 * `rail` (the collapsed wide-screen sidebar) it shows icons only.
 */
export default function Sidebar({ rail = false }: { rail?: boolean }) {
  const { documents } = useLibraryContext()

  return (
    <div
      className={`flex h-full flex-col pt-[26px] pb-5 ${
        rail ? 'px-2.5' : 'px-[18px]'
      }`}
    >
      {/* Only this part scrolls, so the account menu can open over its edge. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Link
          to="/"
          aria-label={rail ? 'SomaNami' : undefined}
          title={rail ? 'SomaNami' : undefined}
          className={`flex items-center gap-[9px] rounded-[10px] ${
            rail ? 'self-center' : 'self-start pl-[9px]'
          }`}
        >
          <BrandMark />
          {!rail && (
            <span className="font-brand text-2xl leading-[1.5] font-bold">
              SomaNami
            </span>
          )}
        </Link>

        <Link
          to="/workspaces/new"
          aria-label={rail ? 'New workspace' : undefined}
          title={rail ? 'New workspace' : undefined}
          className={`mt-7 flex h-10 items-center justify-center gap-[9px] rounded-lg bg-accent text-[13px] font-medium text-on-accent transition-opacity hover:opacity-90 ${
            rail ? 'mx-auto w-11' : ''
          }`}
        >
          <svg {...ICON} width={15} height={15} strokeWidth={2.4}>
            <path d="M5 12h14M12 5v14" />
          </svg>
          {!rail && 'New workspace'}
        </Link>

        <nav aria-label="Main" className="mt-7">
          <ul className="flex flex-col gap-1">
            <NavItem
              to="/"
              end
              rail={rail}
              label="Home"
              icon={
                <svg {...ICON}>
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                </svg>
              }
            />
            <NavItem
              to="/workspaces"
              rail={rail}
              label="Workspaces"
              icon={
                <svg {...ICON}>
                  <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" />
                  <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
                </svg>
              }
            />
            <NavItem
              to="/library"
              rail={rail}
              label="My library"
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
              rail={rail}
              label="Saved conversations"
              icon={
                <svg {...ICON}>
                  <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
                </svg>
              }
            />
          </ul>
        </nav>

        {!rail && <Recents />}
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <UserMenu compact={rail} />
      </div>
    </div>
  )
}
