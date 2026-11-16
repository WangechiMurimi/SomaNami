import { useEffect, useId, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import ConfirmDialog from '../components/ConfirmDialog.tsx'
import { useBreadcrumbs } from '../app/breadcrumbs.ts'
import { ArrowRight, Trash } from '../components/icons.tsx'
import Loading from '../components/Loading.tsx'
import { chatPath } from '../features/chat/conversation-materials.ts'
import { useRecentConversations } from '../features/chat/use-recent-conversations.ts'
import KindIcon from '../features/library/KindIcon.tsx'
import { KIND_LABEL } from '../features/library/kind-label.ts'
import { SearchIcon } from '../features/library/library-icons.tsx'
import { useLibraryContext } from '../features/library/library-context.ts'
import LibraryUpload from '../features/library/LibraryUpload.tsx'
import { useSync } from '../features/sync/sync-context.ts'
import { userWorkspaces } from '../features/workspaces/user-workspaces.ts'
import { useWorkspaces } from '../features/workspaces/use-workspaces.ts'
import {
  createConversation,
  DEFAULT_WORKSPACE,
  isLooseWorkspace,
  listConversations,
} from '../lib/storage/index.ts'
import { count } from '../lib/text/count.ts'
import type {
  Conversation,
  DocumentKind,
  StoredDocument,
} from '../types/contracts.ts'
import { H1, LEDE } from './page-heading.ts'

const HEADER =
  'px-5 py-3.5 text-left text-xs font-medium tracking-[0.06em] text-muted uppercase'

const FILTERS: { label: string; kind: DocumentKind | null }[] = [
  { label: 'All', kind: null },
  { label: 'PDF', kind: 'pdf' },
  { label: 'Word', kind: 'docx' },
  { label: 'Text', kind: 'text' },
  { label: 'Web', kind: 'web' },
]

/** What removing a material does to the chats that use it (US-08 AC5). */
function RemoveMaterial({
  material,
  onDone,
}: {
  material: StoredDocument
  /** Called with what to tell the learner, or nothing if they cancelled. */
  onDone: (notice?: string) => void
}) {
  const { remove } = useLibraryContext()
  const { status: sync, flush } = useSync()
  const inCloud = sync !== 'off'
  const [effect, setEffect] = useState<{ ending: number; keeping: number }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listConversations(material.id).then(
      (using) => {
        if (cancelled) return
        const ending = using.filter(({ materialIds }) =>
          materialIds.every((id) => id === material.id),
        ).length
        setEffect({ ending, keeping: using.length - ending })
      },
      () => !cancelled && setEffect({ ending: 0, keeping: 0 }),
    )
    return () => {
      cancelled = true
    }
  }, [material.id])

  const confirm = async () => {
    setBusy(true)
    try {
      await remove(material.id)
    } catch (cause) {
      console.error('Could not remove the material', cause)
      setError('We couldn’t remove it. Try again.')
      setBusy(false)
      return
    }
    // Deleted here and queued for the cloud; only say "deleted" once the
    // cloud has confirmed it (#147). If it can't yet, the queue keeps it and
    // a later sync finishes the job, so say exactly that.
    try {
      await flush()
      onDone(`‘${material.name}’ deleted`)
    } catch {
      onDone(
        `‘${material.name}’ is removed from your library. We couldn’t reach SomaNami to erase it from your account yet; we’ll finish as soon as we can.`,
      )
    }
  }

  return (
    <ConfirmDialog
      title={`Remove ${material.name}?`}
      confirmLabel="Remove"
      busy={busy || !effect}
      onConfirm={() => void confirm()}
      onCancel={() => onDone()}
    >
      <p>
        {inCloud
          ? 'It will be deleted from your account and all your devices, original file included.'
          : 'It will be deleted.'}
      </p>
      {effect && effect.ending > 0 && (
        <p className="mt-2">
          {count(effect.ending, 'chat', 'chats')} that only used this material
          will be removed too.
        </p>
      )}
      {effect && effect.keeping > 0 && (
        <p className="mt-2">
          {count(effect.keeping, 'chat', 'chats')} that also{' '}
          {effect.keeping === 1 ? 'uses' : 'use'} other materials will keep
          those, and earlier answers that quoted this one will no longer show
          the passage.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-warn">
          {error}
        </p>
      )}
    </ConfirmDialog>
  )
}

/** A file row: clicking anywhere on it starts a loose chat with that file. */
function FileRow({
  material,
  workspaceName,
  onStart,
  onRemove,
}: {
  material: StoredDocument
  workspaceName: string | null
  onStart: () => void
  onRemove: () => void
}) {
  return (
    <tr
      // Mouse users can click the whole row; keyboard users get the name button.
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest('a, button')) onStart()
      }}
      className="group cursor-pointer border-t border-line transition-colors hover:bg-tint/50 focus-within:bg-tint/50"
    >
      <td className="px-5 py-2">
        <button
          type="button"
          onClick={onStart}
          className="flex min-h-11 max-w-[24rem] min-w-0 items-center gap-3 text-left text-[15px] leading-[1.5] font-medium text-fg"
        >
          <KindIcon kind={material.kind} />
          <span className="truncate group-hover:underline">
            {material.name}
          </span>
          <span className="flex flex-none items-center gap-1 rounded-full bg-tint px-2.5 py-0.5 text-xs font-semibold text-accent opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
            Start a chat
            <ArrowRight size={12} strokeWidth={2.4} />
          </span>
        </button>
      </td>
      <td className="px-5 py-3.5 text-sm text-muted">
        {KIND_LABEL[material.kind]}
      </td>
      <td className="px-5 py-3.5 text-sm text-muted">
        {workspaceName ? (
          <Link
            to={`/workspaces/${material.workspaceId}`}
            className="hover:text-fg hover:underline"
          >
            {workspaceName}
          </Link>
        ) : (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Not in a workspace</span>
          </>
        )}
      </td>
      <td className="px-5 py-1.5">
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex size-11 flex-none items-center justify-center rounded-[10px] text-muted hover:bg-warn-soft hover:text-warn"
          >
            <Trash size={17} strokeWidth={1.8} />
            <span className="sr-only">Remove {material.name}</span>
          </button>
        </div>
      </td>
    </tr>
  )
}

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
            <span className="min-w-0 truncate text-[15px] font-medium text-fg">
              {conversation.title}
            </span>
            <span className="flex-none text-[13px] text-muted">
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
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[40rem] border-collapse text-left">
        <caption className="sr-only">Your materials</caption>
        <thead>
          <tr>
            <th scope="col" className={`${HEADER} w-[48%]`}>
              Name
            </th>
            <th scope="col" className={`${HEADER} w-[17%]`}>
              Type
            </th>
            <th scope="col" className={`${HEADER} w-[25%]`}>
              Workspace
            </th>
            <th scope="col" className={`${HEADER} w-[10%]`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((document) => (
            <FileRow
              key={document.id}
              material={document}
              workspaceName={workspaceName(document.workspaceId)}
              onStart={() => void startChat(document)}
              onRemove={() => setRemoving(document)}
            />
          ))}
        </tbody>
      </table>
    </div>
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
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={`${id}-target`} className="text-sm font-medium">
            Add to workspace
          </label>
          <select
            id={`${id}-target`}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="h-11 max-w-full rounded-[10px] border border-edge bg-surface px-3 text-[15px] text-fg"
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
                  className="h-11 w-full rounded-[10px] border border-edge bg-surface pr-3 pl-10 text-[15px] text-fg"
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
              <span aria-live="polite" className="text-[13px] text-muted">
                Showing {shown.length} of {documents.length}
              </span>
            </div>

            {error && (
              <p role="alert" className="rounded-xl bg-warn-soft p-4 text-warn">
                {error}
              </p>
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
        <RemoveMaterial
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
