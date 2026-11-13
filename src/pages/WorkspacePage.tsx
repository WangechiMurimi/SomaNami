import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import Composer from '../components/Composer.tsx'
import { ArrowRight, Lock, Plus } from '../components/icons.tsx'
import {
  chatPath,
  newChatPath,
  titleFrom,
} from '../features/chat/conversation-materials.ts'
import { useRecentConversations } from '../features/chat/use-recent-conversations.ts'
import { WAYS_IN } from '../features/chat/ways-in.ts'
import { KIND_LABEL } from '../features/library/kind-label.ts'
import { useLibraryContext } from '../features/library/library-context.ts'
import AddMaterialsPanel from '../features/workspaces/AddMaterialsPanel.tsx'
import { useWorkspace } from '../features/workspaces/use-workspace.ts'
import { useWorkspaceUpload } from '../features/workspaces/use-workspace-upload.ts'
import { createConversation } from '../lib/storage/index.ts'
import type { Workspace } from '../types/contracts.ts'
import { H1, LEDE } from './page-heading.ts'

const SECTION =
  'flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6'
const SECTION_TITLE = 'text-xl leading-[1.3] font-medium'
const ACTION =
  'flex flex-none items-center gap-[7px] text-[13px] font-semibold text-accent hover:underline'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function WorkspaceView({ workspace }: { workspace: Workspace }) {
  const navigate = useNavigate()
  const { documents } = useLibraryContext()
  const { conversations } = useRecentConversations()
  const materials = documents.filter(
    ({ workspaceId }) => workspaceId === workspace.id,
  )
  const chats = conversations.filter(
    ({ workspaceId }) => workspaceId === workspace.id,
  )
  const [adding, setAdding] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [question, setQuestion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const upload = useWorkspaceUpload(workspace.id)

  // A question asked here uses every material in the workspace.
  const ask = async () => {
    setError(null)
    try {
      const conversation = await createConversation({
        workspaceId: workspace.id,
        materialIds: materials.map(({ id }) => id),
        title: titleFrom(question),
      })
      navigate(chatPath(conversation), { state: { question: question.trim() } })
    } catch (cause) {
      console.error('Could not start the chat', cause)
      setError('We couldn’t start this chat. Try again.')
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-2 text-sm text-muted">
          <li>
            <Link to="/workspaces" className="hover:text-fg hover:underline">
              Workspaces
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="min-w-0 truncate text-fg">
            {workspace.name}
          </li>
        </ol>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          {workspace.topic && (
            <span className="rounded-md bg-tag px-3 py-[5px] text-xs leading-[1.5] font-medium tracking-[0.06em] text-accent uppercase">
              {workspace.topic}
            </span>
          )}
          <h1 className={`${H1} mt-3 break-words`}>{workspace.name}</h1>
          {workspace.description && (
            <p className={LEDE}>{workspace.description}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            aria-expanded={adding}
            onClick={() => setAdding((open) => !open)}
            className="inline-flex h-11 items-center gap-[9px] rounded-[10px] border border-edge bg-surface px-[18px] text-sm font-medium text-fg hover:bg-tint"
          >
            <Plus size={15} strokeWidth={2.4} />
            Add materials
          </button>
          <Link
            to={newChatPath(workspace.id)}
            className="inline-flex h-11 items-center gap-[9px] rounded-[10px] bg-accent px-[18px] text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            New chat
          </Link>
        </div>
      </div>

      {adding && (
        <AddMaterialsPanel
          upload={upload}
          pasting={pasting}
          onPastingChange={setPasting}
        />
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="materials-title" className={SECTION}>
          <div className="flex items-center gap-2.5">
            <h2 id="materials-title" className={SECTION_TITLE}>
              Materials
            </h2>
            <span className="rounded-full bg-tag px-2.5 py-0.5 text-xs font-medium text-accent">
              {materials.length}
            </span>
          </div>
          {materials.length === 0 ? (
            <p className="text-muted">
              No materials yet. Add notes, readings or slides for this workspace
              to learn from.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {materials.map((material) => (
                <li
                  key={material.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {material.name}
                    </span>
                    <span className="text-[13px] text-muted">
                      {KIND_LABEL[material.kind]}
                    </span>
                  </div>
                  <Link
                    to={newChatPath(workspace.id, material.id)}
                    className={ACTION}
                  >
                    Ask about this
                    <span className="sr-only">: {material.name}</span>
                    <ArrowRight size={14} strokeWidth={2.2} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <Lock size={14} strokeWidth={1.9} />
            Chats in this workspace can only see{' '}
            {materials.length === 1
              ? 'this material'
              : `these ${materials.length} materials`}
            .
          </p>
        </section>

        <section aria-labelledby="chats-title" className={SECTION}>
          <h2 id="chats-title" className={SECTION_TITLE}>
            Chats
          </h2>
          {chats.length === 0 ? (
            <p className="text-muted">No chats yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {chats.map((chat) => (
                <li key={chat.id}>
                  <Link
                    to={chatPath(chat)}
                    className="flex items-center justify-between gap-3 rounded-[10px] border border-line px-4 py-3 hover:border-accent"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {chat.title}
                    </span>
                    <span className="flex-none text-[13px] font-semibold text-accent">
                      Continue
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mt-2 text-[13px] font-medium tracking-[0.06em] text-muted uppercase">
            Or start with a way of understanding
          </h3>
          <ul className="flex flex-col gap-2">
            {WAYS_IN.map(({ title, prompt }, index) => (
              <li key={title}>
                <Link
                  to={`${newChatPath(workspace.id)}?q=${encodeURIComponent(prompt)}`}
                  className="flex items-center gap-3 rounded-[10px] border border-line px-4 py-3 hover:border-accent hover:text-accent"
                >
                  <span aria-hidden="true" className="text-accent">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="flex-1 font-medium">{title}</span>
                  <ArrowRight size={14} strokeWidth={2.2} />
                </Link>
              </li>
            ))}
          </ul>
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
        canSend={materials.length > 0 && question.trim().length > 0}
        sendDescription={
          materials.length === 0
            ? 'Add a material to start asking.'
            : 'Type a question to send.'
        }
        onUpload={(file) => {
          setAdding(true)
          void upload.upload(file)
        }}
        onPaste={() => {
          setAdding(true)
          setPasting(true)
        }}
        extra={
          <span className="ml-1 flex items-center gap-1.5 text-[13px] text-muted">
            <Lock size={13} strokeWidth={1.9} />
            {plural(materials.length, 'material')}
          </span>
        }
      />
    </div>
  )
}

/** One workspace: its materials, its chats and a place to ask (US-08 AC4). */
export default function WorkspacePage() {
  const { workspaceId = '' } = useParams()
  const state = useWorkspace(workspaceId)

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
          It may have been removed, or saved on another device.{' '}
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
