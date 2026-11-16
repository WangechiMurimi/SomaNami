import { useCallback, useId, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useBreadcrumbs } from '../app/breadcrumbs.ts'
import Composer from '../components/Composer.tsx'
import { ArrowRight, Plus } from '../components/icons.tsx'
import { Chats, FileIcon } from '../features/chat/chat-icons.tsx'
import {
  chatPath,
  materialsFor,
} from '../features/chat/conversation-materials.ts'
import { useStartChat } from '../features/chat/use-start-chat.ts'
import { useRecentConversations } from '../features/chat/use-recent-conversations.ts'
import { KIND_LABEL } from '../features/library/kind-label.ts'
import { useLibraryContext } from '../features/library/library-context.ts'
import AddMaterialsPanel from '../features/workspaces/AddMaterialsPanel.tsx'
import WorkspaceActionDialog from '../features/workspaces/WorkspaceActionDialog.tsx'
import { Bookmark } from '../features/workspaces/workspace-icons.tsx'
import { useWorkspace } from '../features/workspaces/use-workspace.ts'
import { useWorkspaceUpload } from '../features/workspaces/use-workspace-upload.ts'
import { isLooseWorkspace, setConversationSaved } from '../lib/storage/index.ts'
import type {
  Conversation,
  StoredDocument,
  Workspace,
} from '../types/contracts.ts'
import { H1, H2, LEDE } from './page-heading.ts'

const HEADER_BUTTON =
  'inline-flex h-11 items-center gap-2 rounded-[10px] border border-edge bg-surface px-4 text-sm font-medium text-fg hover:bg-tint'

const BADGE: Record<StoredDocument['kind'], string> = {
  pdf: 'PDF',
  docx: 'DOCX',
  text: 'TXT',
  web: 'WEB',
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The "N sources" chip on a chat row, opening the list of materials it uses. */
function ChatSources({ sources }: { sources: StoredDocument[] }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div
      className="relative"
      onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((shown) => !shown)}
        className="flex h-8 items-center gap-1.5 rounded-full border border-edge px-2.5 text-[13px] text-muted hover:text-fg"
      >
        <FileIcon size={14} strokeWidth={1.9} />
        {plural(sources.length, 'source')}
      </button>
      {open && (
        <div
          id={id}
          className="absolute top-[calc(100%+6px)] left-0 z-20 w-max max-w-[min(20rem,80vw)] rounded-[10px] bg-fg px-3.5 py-2.5 text-ground shadow-lg"
        >
          <p className="mb-1 text-xs leading-[1.5] font-semibold tracking-[0.06em] uppercase">
            Sources in this chat
          </p>
          {sources.length === 0 ? (
            <p className="text-[13px]">Its materials have been removed.</p>
          ) : (
            <ul className="list-disc pl-[18px] text-[13px] leading-[1.65]">
              {sources.map(({ id: key, name }) => (
                <li key={key} className="break-words">
                  {name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/** Saves a chat to Saved conversations, or takes it off again. */
function SaveToggle({ chat }: { chat: Conversation }) {
  const saved = Boolean(chat.saved)
  const [failed, setFailed] = useState(false)
  const toggle = () => {
    setFailed(false)
    setConversationSaved(chat.id, !saved).catch((cause: unknown) => {
      console.error('Could not save the chat', cause)
      setFailed(true)
    })
  }
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={`Save ${chat.title}`}
      title={failed ? 'That didn’t work. Try again.' : undefined}
      onClick={toggle}
      className={`flex h-11 flex-none items-center gap-1.5 rounded-[10px] px-2.5 text-sm font-medium hover:bg-tint ${
        saved ? 'text-accent' : 'text-muted hover:text-fg'
      }`}
    >
      <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
      {/* The label stays "Save"; aria-pressed and the filled icon carry the state. */}
      Save
    </button>
  )
}

function ChatList({
  chats,
  documents,
}: {
  chats: Conversation[]
  documents: StoredDocument[]
}) {
  if (chats.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-surface px-5 py-6 text-muted">
        No chats yet. Ask a question below to start one.
      </p>
    )
  }
  return (
    <ul
      aria-label="Chats in this workspace"
      className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface"
    >
      {chats.map((chat) => (
        <li
          key={chat.id}
          className="flex items-center gap-3.5 px-4 py-3.5 sm:px-5"
        >
          <span
            aria-hidden="true"
            className="hidden size-10 flex-none items-center justify-center rounded-[10px] bg-tint text-accent sm:flex"
          >
            <Chats size={18} strokeWidth={1.7} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
            <span className="max-w-full truncate text-[15px] leading-[1.5] font-medium">
              {chat.title}
            </span>
            <ChatSources sources={materialsFor(chat, documents)} />
          </div>
          <SaveToggle chat={chat} />
          <Link
            to={chatPath(chat)}
            className="flex h-11 flex-none items-center gap-[7px] text-sm font-semibold text-accent hover:underline"
          >
            Continue
            <span className="sr-only">: {chat.title}</span>
            <ArrowRight size={14} strokeWidth={2.2} />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function WorkspaceView({ workspace }: { workspace: Workspace }) {
  const { documents } = useLibraryContext()
  const { conversations } = useRecentConversations()
  const materials = useMemo(
    () => documents.filter(({ workspaceId }) => workspaceId === workspace.id),
    [documents, workspace.id],
  )
  const chats = conversations.filter(
    ({ workspaceId }) => workspaceId === workspace.id,
  )
  // Ids the learner unticked; everything else, including materials added
  // later, is in, so a question asked here uses the whole workspace by default.
  const [excluded, setExcluded] = useState<string[]>([])
  const selected = materials.filter(({ id }) => !excluded.includes(id))
  const allSelected = selected.length === materials.length
  const [pasting, setPasting] = useState(false)
  const [question, setQuestion] = useState('')
  const { start, starting, error } = useStartChat()
  const [dialog, setDialog] = useState<'add-sources' | 'remove-sources'>()
  // A material added here joins the selection even if it was unticked before.
  const include = useCallback(
    (material: StoredDocument) =>
      setExcluded((current) => current.filter((id) => id !== material.id)),
    [],
  )
  const upload = useWorkspaceUpload(workspace.id, include)

  const toggle = (id: string) =>
    setExcluded((current) =>
      current.includes(id)
        ? current.filter((other) => other !== id)
        : [...current, id],
    )

  const ask = () =>
    start({
      workspaceId: workspace.id,
      materialIds: selected.map(({ id }) => id),
      question,
    })

  const sendDescription =
    materials.length === 0
      ? 'Add a material to start asking.'
      : selected.length === 0
        ? 'Tick at least one material to ask about.'
        : 'Type a question to send.'

  return (
    <div className="flex flex-col gap-6">
      {/* The workspace starts straight away: its name and what you can do. */}
      <div className="flex min-h-[50px] flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl leading-[1.3] font-semibold break-words">
          {workspace.name}
        </h1>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => setDialog('add-sources')}
            className={HEADER_BUTTON}
          >
            <Plus size={15} strokeWidth={2.2} />
            Add sources
          </button>
          <button
            type="button"
            onClick={() => setDialog('remove-sources')}
            disabled={materials.length === 0}
            className={`${HEADER_BUTTON} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Remove sources
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-x-11 gap-y-10">
        <section
          aria-labelledby="chats-title"
          className="flex min-w-0 flex-[1.6_1_420px] flex-col gap-4"
        >
          <h2 id="chats-title" className={H2}>
            Chats
          </h2>
          <ChatList chats={chats} documents={documents} />
        </section>

        <section
          aria-labelledby="materials-title"
          className="flex min-w-0 flex-[1_1_340px] flex-col gap-4"
        >
          <h2 id="materials-title" className={H2}>
            Your materials
          </h2>
          <AddMaterialsPanel
            upload={upload}
            pasting={pasting}
            onPastingChange={setPasting}
          />
          {materials.length === 0 ? (
            <p className="text-[13px] text-muted">
              Nothing here yet. Add notes, readings or slides for this workspace
              to learn from.
            </p>
          ) : (
            <div
              role="group"
              aria-labelledby="selected-title"
              className="flex flex-col gap-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <h3
                  id="selected-title"
                  className="text-xs leading-[1.5] font-semibold tracking-[0.08em] text-muted uppercase"
                >
                  In this workspace
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    setExcluded(
                      allSelected ? materials.map(({ id }) => id) : [],
                    )
                  }
                  className="h-11 px-1 text-[13px] font-semibold text-accent hover:underline"
                >
                  {allSelected ? 'Select none' : 'Select all'}
                </button>
              </div>
              <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
                {materials.map((material) => {
                  const inputId = `material-${material.id}`
                  return (
                    <li key={material.id}>
                      <label
                        htmlFor={inputId}
                        className="flex min-h-14 cursor-pointer items-center gap-2.5 px-3 py-2.5"
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-9 w-8 flex-none flex-col items-center justify-center gap-px rounded-[7px] bg-tint text-accent"
                        >
                          <FileIcon size={14} strokeWidth={1.9} />
                          <span className="text-[8px] font-bold tracking-[0.04em]">
                            {BADGE[material.kind]}
                          </span>
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span
                            title={material.name}
                            className="truncate text-sm leading-[1.45] font-semibold"
                          >
                            {material.name}
                          </span>
                          <span className="text-[13px] leading-[1.5] text-muted">
                            {KIND_LABEL[material.kind]}
                          </span>
                        </span>
                        <input
                          id={inputId}
                          type="checkbox"
                          checked={!excluded.includes(material.id)}
                          onChange={() => toggle(material.id)}
                          className="size-[18px] flex-none cursor-pointer accent-accent"
                        />
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>
      </div>

      {error && (
        <p role="alert" className="rounded-[10px] bg-warn-soft p-4 text-warn">
          {error}
        </p>
      )}

      <Composer
        label={`Ask about ${workspace.name}`}
        placeholder={`Ask about ${workspace.name}`}
        value={question}
        onChange={setQuestion}
        onSubmit={() => void ask()}
        canSend={!starting && selected.length > 0 && question.trim().length > 0}
        sendDescription={sendDescription}
        onUpload={(file) => void upload.upload(file)}
        onPaste={() => setPasting(true)}
      />

      {dialog && (
        <WorkspaceActionDialog
          action={dialog}
          workspace={workspace}
          chats={chats.length}
          onClose={() => setDialog(undefined)}
        />
      )}
    </div>
  )
}

/** One workspace: its chats, its materials and a place to ask (US-08 AC4). */
export default function WorkspacePage() {
  const { workspaceId = '' } = useParams()
  const found = useWorkspace(workspaceId)
  // The default workspace holds loose chats; it is never opened as a workspace.
  const state: typeof found = isLooseWorkspace(workspaceId)
    ? { status: 'missing' }
    : found
  const ready = state.status === 'ready' ? state.workspace : undefined
  useBreadcrumbs([
    { label: 'Workspaces', to: '/workspaces' },
    ...(ready?.topic ? [{ label: ready.topic }] : []),
    ...(ready ? [{ label: ready.name }] : []),
  ])

  if (state.status === 'loading') {
    return (
      <p role="status" className="text-muted">
        Opening your workspace…
      </p>
    )
  }
  if (state.status === 'missing') {
    return (
      <div>
        <h1 className={H1}>We can’t find that workspace</h1>
        <p className={LEDE}>
          It may have been removed.{' '}
          <Link
            to="/workspaces"
            className="font-semibold text-accent underline"
          >
            See your workspaces
          </Link>
        </p>
      </div>
    )
  }
  return <WorkspaceView key={state.workspace.id} workspace={state.workspace} />
}
