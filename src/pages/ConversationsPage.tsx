import { useId, useState } from 'react'
import { Link } from 'react-router'
import { useBreadcrumbs } from '../app/breadcrumbs.ts'
import { ArrowRight } from '../components/icons.tsx'
import { chatPath } from '../features/chat/conversation-materials.ts'
import { useRecentConversations } from '../features/chat/use-recent-conversations.ts'
import { userWorkspaces } from '../features/workspaces/user-workspaces.ts'
import { useWorkspaces } from '../features/workspaces/use-workspaces.ts'
import { Bookmark } from '../features/workspaces/workspace-icons.tsx'
import {
  DEFAULT_WORKSPACE,
  isLooseWorkspace,
  setConversationSaved,
} from '../lib/storage/index.ts'
import type { Conversation } from '../types/contracts.ts'
import { H1, LEDE } from './page-heading.ts'

const DATE = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const FIELD =
  'h-11 w-full rounded-[10px] border border-edge bg-surface px-3 text-[15px] text-fg'

const ALL = 'all'

const conversationCount = (n: number) =>
  `${n} ${n === 1 ? 'conversation' : 'conversations'}`

/** Saved chats from Recents and from every workspace, newest first. */
export default function ConversationsPage() {
  const id = useId()
  const { conversations, status } = useRecentConversations()
  const { workspaces } = useWorkspaces()
  const [query, setQuery] = useState('')
  const [place, setPlace] = useState(ALL)
  const [error, setError] = useState<string | null>(null)
  useBreadcrumbs([{ label: 'Saved conversations' }])

  const saved = conversations.filter((conversation) => conversation.saved)
  const ownWorkspaces = userWorkspaces(workspaces)
  // Loose chats live in the default workspace, which is shown as Recents.
  const placeOf = ({ workspaceId }: Conversation) =>
    isLooseWorkspace(workspaceId)
      ? 'Recents'
      : (workspaces.find(({ id }) => id === workspaceId)?.name ?? 'Workspace')
  const needle = query.trim().toLowerCase()
  const shown = saved.filter(
    (conversation) =>
      (place === ALL || conversation.workspaceId === place) &&
      conversation.title.toLowerCase().includes(needle),
  )

  const unsave = (conversation: Conversation) => {
    setError(null)
    setConversationSaved(conversation.id, false).catch((cause: unknown) => {
      console.error('Could not unsave the chat', cause)
      setError('We couldn’t unsave that chat. Try again.')
    })
  }

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <div>
        <h1 className={H1}>Saved conversations</h1>
        <p className={LEDE}>
          Chats you saved from Recents and your workspaces. Open one to keep
          going.
        </p>
      </div>

      {status === 'loading' ? (
        <p role="status" className="text-muted">
          Opening your chats…
        </p>
      ) : status === 'error' ? (
        <p role="alert" className="rounded-xl bg-warn-soft p-6 text-warn">
          We couldn’t open your saved chats. Reload the page to try again.
        </p>
      ) : saved.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-line bg-surface p-6">
          <Bookmark size={22} className="text-accent" />
          <h2 className="text-lg font-semibold">No saved chats yet</h2>
          <p className="text-[15px] leading-[1.6] text-muted">
            Save a chat from Recents or from a{' '}
            <Link
              to="/workspaces"
              className="font-semibold text-accent underline"
            >
              workspace
            </Link>{' '}
            to keep it here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex min-w-[14rem] flex-[2_1_14rem] flex-col gap-2">
              <label htmlFor={`${id}-search`} className="text-sm font-medium">
                Search by title
              </label>
              <input
                id={`${id}-search`}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={FIELD}
              />
            </div>
            <div className="flex min-w-[12rem] flex-[1_1_12rem] flex-col gap-2">
              <label htmlFor={`${id}-place`} className="text-sm font-medium">
                Workspace
              </label>
              <select
                id={`${id}-place`}
                value={place}
                onChange={(event) => setPlace(event.target.value)}
                className={FIELD}
              >
                <option value={ALL}>All</option>
                <option value={DEFAULT_WORKSPACE.id}>Recents</option>
                {ownWorkspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-warn-soft p-4 text-warn">
              {error}
            </p>
          )}

          <section
            aria-labelledby={`${id}-count`}
            className="flex flex-col gap-3"
          >
            <h2
              id={`${id}-count`}
              aria-live="polite"
              className="text-[13px] font-medium text-muted"
            >
              {conversationCount(shown.length)} · newest first
            </h2>
            {shown.length === 0 ? (
              <p className="rounded-xl border border-line bg-surface p-6 text-muted">
                No saved chats match.
              </p>
            ) : (
              <ul
                aria-label="Saved chats"
                className="divide-y divide-line rounded-xl border border-line bg-surface"
              >
                {shown.map((conversation) => (
                  <li
                    key={conversation.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4"
                  >
                    <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1">
                      <Link
                        to={chatPath(conversation)}
                        className="truncate font-medium text-fg hover:underline"
                      >
                        {conversation.title}
                      </Link>
                      <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                        <span className="rounded-md bg-tag px-2 py-0.5 text-xs font-medium text-accent">
                          {placeOf(conversation)}
                        </span>
                        <time
                          dateTime={new Date(
                            conversation.updatedAt,
                          ).toISOString()}
                        >
                          {DATE.format(conversation.updatedAt)}
                        </time>
                      </span>
                    </div>
                    <div className="flex flex-none items-center gap-1">
                      <button
                        type="button"
                        onClick={() => unsave(conversation)}
                        className="inline-flex h-11 items-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-muted hover:bg-tint hover:text-fg"
                      >
                        <Bookmark size={16} fill="currentColor" />
                        Unsave
                        <span className="sr-only">: {conversation.title}</span>
                      </button>
                      <Link
                        to={chatPath(conversation)}
                        aria-hidden="true"
                        tabIndex={-1}
                        className="inline-flex h-11 items-center gap-[7px] px-2 text-sm font-semibold text-accent hover:underline"
                      >
                        Continue
                        <ArrowRight size={14} strokeWidth={2.2} />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
