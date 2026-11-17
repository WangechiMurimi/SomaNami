import { useId, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useBreadcrumbs } from '../app/breadcrumbs.ts'
import ErrorAlert from '../components/ErrorAlert.tsx'
import Loading from '../components/Loading.tsx'
import { chatPath } from '../features/chat/conversation-materials.ts'
import { useRecentConversations } from '../features/chat/use-recent-conversations.ts'
import { SearchIcon } from '../features/library/library-icons.tsx'
import { useLibraryContext } from '../features/library/library-context.ts'
import FileTable from '../features/library/FileTable.tsx'
import LibraryUpload from '../features/library/LibraryUpload.tsx'
import RemoveMaterialDialog from '../features/library/RemoveMaterialDialog.tsx'
import { userWorkspaces } from '../features/workspaces/user-workspaces.ts'
import { useWorkspaces } from '../features/workspaces/use-workspaces.ts'
import {
  createConversation,
  DEFAULT_WORKSPACE,
  isLooseWorkspace,
} from '../lib/storage/index.ts'
import type {
  Conversation,
  DocumentKind,
  StoredDocument,
} from '../types/contracts.ts'
import { H1, LEDE } from './page-heading.ts'

const FILTERS: { label: string; kind: DocumentKind | null }[] = [
  { label: 'All', kind: null },
  { label: 'PDF', kind: 'pdf' },
  { label: 'Word', kind: 'docx' },
  { label: 'Text', kind: 'text' },
  { label: 'Web', kind: 'web' },
]

/** Conversations whose title matches the library search. */
function ConversationResults({
  conversations,
  placeOf,
}: {
  conversations: Conversation[]
  placeOf: (conversation: Conversation) => string
}) {
  if (conversations.length === 0) {
    return <p className="text-sm text-muted">No conversations match.</p>
  }
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <Link
            to={chatPath(conversation)}
            className="flex min-h-14 items-center justify-between gap-3 px-5 py-3 hover:bg-tint/50"
          >
            <span className="min-w-0 truncate text-[0.9375rem] font-medium text-fg">
              {conversation.title}
            </span>
            <span className="flex-none text-[0.8125rem] text-muted">
              {placeOf(conversation)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

const GROUP =
  'text-xs leading-[1.5] font-semibold tracking-[0.08em] text-muted uppercase'

/**
 * Every stored material, searchable with the conversations about them and
 * filterable by type. Clicking a file starts a chat with just that file.
 */
export default function LibraryPage() {
  const id = useId()
  const navigate = useNavigate()
  const { documents, status } = useLibraryContext()
  const { workspaces } = useWorkspaces()
  const { conversations } = useRecentConversations()
  const [kind, setKind] = useState<DocumentKind | null>(null)
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<string>(DEFAULT_WORKSPACE.id)
  const [removing, setRemoving] = useState<StoredDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  useBreadcrumbs([{ label: 'My library' }])

  const needle = query.trim().toLowerCase()
  const searching = needle.length > 0
  const matches = (text: string) => text.toLowerCase().includes(needle)
  const shown = documents.filter(
    (document) =>
      (!kind || document.kind === kind) &&
      (!searching || matches(document.name)),
  )
  const foundConversations = searching
    ? conversations.filter(({ title }) => matches(title))
    : []
  // The default workspace holds loose material; it is never named as one.
  const workspaceName = (workspaceId: string) =>
    isLooseWorkspace(workspaceId)
      ? null
      : (workspaces.find(({ id }) => id === workspaceId)?.name ?? null)
  const placeOf = ({ workspaceId }: Conversation) =>
    workspaceName(workspaceId) ?? 'Recents'

  const startChat = async (material: StoredDocument) => {
    setError(null)
    try {
      const conversation = await createConversation({
        workspaceId: DEFAULT_WORKSPACE.id,
        materialIds: [material.id],
        title: material.name,
      })
      navigate(chatPath(conversation))
    } catch (cause) {
      console.error('Could not start the chat', cause)
      setError('We couldn’t start a chat with that file. Try again.')
    }
  }

  const fileTable = (
    <FileTable
      materials={shown}
      workspaceName={workspaceName}
      onStart={(document) => void startChat(document)}
      onRemove={setRemoving}
    />
  )

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div>
          <h1 className={H1}>My library</h1>
          <p className={LEDE}>
            Everything you’ve added lives here. Click a file to start a chat
            with it.
          </p>
        </div>
        <div className="flex min-w-0 flex-col">
          {/* Not shown, but the picker still needs a name for screen readers. */}
          <label htmlFor={`${id}-target`} className="sr-only">
            Add to workspace
          </label>
          <select
            id={`${id}-target`}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="h-11 max-w-full rounded-[10px] border border-edge bg-surface px-3 text-[0.9375rem] text-fg"
          >
            <option value={DEFAULT_WORKSPACE.id}>No workspace</option>
            {userWorkspaces(workspaces).map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <LibraryUpload key={target} workspaceId={target} />

      <section aria-label="Materials" className="flex flex-col gap-4">
        {/* Always rendered, so screen readers announce the message when it appears. */}
        <p role="status" className="text-sm text-muted empty:hidden">
          {notice}
        </p>
        {status === 'loading' ? (
          <Loading>Opening your library…</Loading>
        ) : documents.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface p-6 text-muted">
            Nothing here yet. Upload a document above to start.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <label htmlFor={`${id}-search`} className="text-sm font-medium">
                Search your library
              </label>
              <div className="relative max-w-xl">
                <SearchIcon
                  size={17}
                  className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
                />
                <input
                  id={`${id}-search`}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Conversations and file names"
                  className="h-11 w-full rounded-[10px] border border-edge bg-surface pr-3 pl-10 text-[0.9375rem] text-fg"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                role="group"
                aria-label="Filter by type"
                className="flex flex-wrap gap-2"
              >
                {FILTERS.map((filter) => (
                  <button
                    key={filter.label}
                    type="button"
                    aria-pressed={kind === filter.kind}
                    onClick={() => setKind(filter.kind)}
                    className={`inline-flex h-11 items-center rounded-full border px-3.5 text-sm transition-colors ${
                      kind === filter.kind
                        ? 'border-accent bg-tint font-semibold text-accent'
                        : 'border-edge bg-surface text-muted hover:text-fg'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <span aria-live="polite" className="text-[0.8125rem] text-muted">
                Showing {shown.length} of {documents.length}
              </span>
            </div>

            {error && (
              <ErrorAlert className="rounded-xl p-4">{error}</ErrorAlert>
            )}

            {searching ? (
              <>
                <section
                  aria-labelledby={`${id}-conversations`}
                  className="flex flex-col gap-3"
                >
                  <h2 id={`${id}-conversations`} className={GROUP}>
                    Conversations
                  </h2>
                  <ConversationResults
                    conversations={foundConversations}
                    placeOf={placeOf}
                  />
                </section>
                <section
                  aria-labelledby={`${id}-files`}
                  className="flex flex-col gap-3"
                >
                  <h2 id={`${id}-files`} className={GROUP}>
                    Files
                  </h2>
                  {shown.length === 0 ? (
                    <p className="text-sm text-muted">No files match.</p>
                  ) : (
                    fileTable
                  )}
                </section>
              </>
            ) : (
              fileTable
            )}
          </>
        )}
      </section>

      {removing && (
        <RemoveMaterialDialog
          material={removing}
          onDone={(message) => {
            setRemoving(null)
            if (message) setNotice(message)
          }}
        />
      )}
    </div>
  )
}
