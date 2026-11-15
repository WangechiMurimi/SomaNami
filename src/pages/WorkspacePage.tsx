import { useCallback, useId, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useBreadcrumbs } from '../app/breadcrumbs.ts'
import Composer from '../components/Composer.tsx'
import { ArrowRight, Lock } from '../components/icons.tsx'
import { Chats, FileIcon } from '../features/chat/chat-icons.tsx'
import {
  chatPath,
  materialsFor,
  titleFrom,
} from '../features/chat/conversation-materials.ts'
import { useRecentConversations } from '../features/chat/use-recent-conversations.ts'
import { KIND_LABEL } from '../features/library/kind-label.ts'
import { useLibraryContext } from '../features/library/library-context.ts'
import AddMaterialsPanel from '../features/workspaces/AddMaterialsPanel.tsx'
import { useWorkspace } from '../features/workspaces/use-workspace.ts'
import { useWorkspaceUpload } from '../features/workspaces/use-workspace-upload.ts'
import { createConversation } from '../lib/storage/index.ts'
import type {
  Conversation,
  StoredDocument,
  Workspace,
} from '../types/contracts.ts'
import { H1, H2, LEDE } from './page-heading.ts'

const BADGE: Record<StoredDocument['kind'], string> = {
  pdf: 'PDF',
  docx: 'DOCX',
  text: 'TXT',
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
  const navigate = useNavigate()
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
  const [error, setError] = useState<string | null>(null)
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

  const ask = async () => {
    setError(null)
    try {
      const conversation = await createConversation({
        workspaceId: workspace.id,
        materialIds: selected.map(({ id }) => id),
        title: titleFrom(question),
      })
      navigate(chatPath(conversation), { state: { question: question.trim() } })
    } catch (cause) {
      console.error('Could not start the chat', cause)
      setError('We couldn’t start this chat. Try again.')
    }
  }

  const sendDescription =
    materials.length === 0
      ? 'Add a material to start asking.'
      : selected.length === 0
        ? 'Tick at least one material to ask about.'
        : 'Type a question to send.'

  return (
    <div className="flex flex-col gap-6">
      <div className="min-w-0">
        {workspace.topic && (
          <span className="mb-3 inline-block rounded-md bg-tag px-3 py-[5px] text-xs leading-[1.5] font-medium tracking-[0.06em] text-accent uppercase">
            {workspace.topic}
          </span>
        )}
        <h1 className={`${H1} break-words`}>{workspace.name}</h1>
        {workspace.description && (
          <p className={LEDE}>{workspace.description}</p>
        )}
      </div>

      <hr className="border-line" />

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
              <p
                aria-live="polite"
                className="flex items-start gap-2 text-[13px] leading-[1.5] text-muted"
              >
                <Lock
                  size={14}
                  strokeWidth={1.9}
                  className="mt-0.5 flex-none"
                />
                {selected.length === 0
                  ? 'Tick the materials a new question may use.'
                  : `A new question here uses only ${
                      allSelected
                        ? materials.length === 1
                          ? 'this material'
                          : `these ${materials.length} materials`
                        : `the ${plural(selected.length, 'material')} you ticked`
                    }.`}
              </p>
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
        canSend={selected.length > 0 && question.trim().length > 0}
        sendDescription={sendDescription}
        onUpload={(file) => void upload.upload(file)}
        onPaste={() => setPasting(true)}
        extra={
          <span className="ml-2 flex items-center gap-1.5 rounded-full bg-tint px-2.5 py-1 text-[13px] leading-[1.5] text-accent">
            <Lock size={14} strokeWidth={1.9} />
            {allSelected
              ? plural(materials.length, 'material')
              : `${selected.length} of ${plural(materials.length, 'material')}`}
          </span>
        }
      />
    </div>
  )
}

/** One workspace: its chats, its materials and a place to ask (US-08 AC4). */
export default function WorkspacePage() {
  const { workspaceId = '' } = useParams()
  const state = useWorkspace(workspaceId)
  useBreadcrumbs([
    { label: 'Workspaces', to: '/workspaces' },
    ...(state.status === 'ready' ? [{ label: state.workspace.name }] : []),
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
          It may have been removed, or added on another device. For now, each
          device keeps its own materials and chats.{' '}
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
