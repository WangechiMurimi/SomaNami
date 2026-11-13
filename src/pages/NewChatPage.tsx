import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import Composer from '../components/Composer.tsx'
import { Check, Lock, Plus } from '../components/icons.tsx'
import { chatPath, titleFrom } from '../features/chat/conversation-materials.ts'
import { WAYS_IN } from '../features/chat/ways-in.ts'
import { useLibraryContext } from '../features/library/library-context.ts'
import AddMaterialsPanel from '../features/workspaces/AddMaterialsPanel.tsx'
import { useWorkspace } from '../features/workspaces/use-workspace.ts'
import { useWorkspaceUpload } from '../features/workspaces/use-workspace-upload.ts'
import { createConversation } from '../lib/storage/index.ts'
import type { StoredDocument, Workspace } from '../types/contracts.ts'
import { H1, LEDE } from './page-heading.ts'

function NewChat({
  workspace,
  materials,
  preselected,
  initialQuestion,
}: {
  workspace: Workspace
  materials: StoredDocument[]
  preselected: string | null
  initialQuestion: string
}) {
  const navigate = useNavigate()
  // Until the user picks, a chat opened from one material uses that one, and
  // a chat opened from the workspace uses all of them.
  const [picked, setPicked] = useState<string[] | null>(null)
  const suggested = useMemo(
    () =>
      preselected && materials.some(({ id }) => id === preselected)
        ? [preselected]
        : materials.map(({ id }) => id),
    [materials, preselected],
  )
  const chosen = picked ?? suggested
  const [question, setQuestion] = useState(initialQuestion)
  const [adding, setAdding] = useState(materials.length === 0)
  const [pasting, setPasting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const toggle = (id: string) =>
    setPicked(
      chosen.includes(id) ? chosen.filter((m) => m !== id) : [...chosen, id],
    )

  // New materials join this chat straight away.
  const select = useCallback(
    (material: StoredDocument) =>
      setPicked((current) => [
        ...(current ?? suggested).filter((id) => id !== material.id),
        material.id,
      ]),
    [suggested],
  )
  const upload = useWorkspaceUpload(workspace.id, select)

  const status =
    chosen.length === 0
      ? 'Choose at least one material to start.'
      : `This chat will use ${chosen.length} of ${materials.length} ${
          materials.length === 1 ? 'material' : 'materials'
        }.`

  const start = async () => {
    setStarting(true)
    setError(null)
    try {
      const conversation = await createConversation({
        workspaceId: workspace.id,
        materialIds: chosen,
        title: titleFrom(question),
      })
      navigate(chatPath(conversation), { state: { question: question.trim() } })
    } catch (cause) {
      console.error('Could not start the chat', cause)
      setError('We couldn’t start this chat. Try again.')
      setStarting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-[54rem] flex-col gap-8">
      <div>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-tint px-3 py-1.5 text-[13px] text-accent">
          <Lock size={14} />
          Locked to your content
        </p>
        <h1 className={`${H1} mt-4`}>What would you like to understand?</h1>
        <p className={LEDE}>
          This chat only sees the materials you pick below. It won’t look
          anywhere else.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-medium">This chat can use</h2>
          <span className="text-[13px] text-muted">
            From{' '}
            <Link
              to={`/workspaces/${workspace.id}`}
              className="text-accent hover:underline"
            >
              {workspace.name}
            </Link>
          </span>
        </div>
        <div
          role="group"
          aria-label="Materials for this chat"
          className="flex flex-wrap gap-2"
        >
          {materials.map((material) => {
            const on = chosen.includes(material.id)
            return (
              <button
                key={material.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(material.id)}
                className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium ${
                  on
                    ? 'border-accent bg-tint text-accent'
                    : 'border-edge text-muted hover:text-fg'
                }`}
              >
                {on && <Check size={14} strokeWidth={2.6} />}
                {material.name}
              </button>
            )
          })}
          <button
            type="button"
            aria-expanded={adding}
            onClick={() => setAdding((open) => !open)}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-dashed border-edge px-4 text-sm font-medium text-fg hover:bg-tint"
          >
            <Plus size={14} strokeWidth={2.4} />
            Add materials
          </button>
        </div>
        <p aria-live="polite" className="text-[13px] text-muted">
          {status}
        </p>
      </div>

      {adding && (
        <AddMaterialsPanel
          upload={upload}
          pasting={pasting}
          onPastingChange={setPasting}
        />
      )}

      {error && (
        <p role="alert" className="rounded-[10px] bg-warn-soft p-4 text-warn">
          {error}
        </p>
      )}

      <Composer
        label="Ask a question about your materials"
        placeholder="Ask a question about your materials"
        value={question}
        onChange={setQuestion}
        onSubmit={() => void start()}
        canSend={!starting && chosen.length > 0 && question.trim().length > 0}
        sendDescription={
          chosen.length === 0 ? status : 'Type a question to send.'
        }
        onUpload={(file) => void upload.upload(file)}
        onPaste={() => {
          setAdding(true)
          setPasting(true)
        }}
      />

      <div className="flex flex-col gap-3">
        <h2 className="text-[13px] font-medium tracking-[0.06em] text-muted uppercase">
          Or start with a way of understanding
        </h2>
        <div className="flex flex-wrap gap-2">
          {WAYS_IN.map(({ title, prompt }, index) => (
            <button
              key={title}
              type="button"
              onClick={() => setQuestion(prompt)}
              className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-line bg-surface px-4 text-sm font-medium hover:border-accent hover:text-accent"
            >
              <span aria-hidden="true" className="text-accent">
                {String(index + 1).padStart(2, '0')}
              </span>
              {title}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Choose a workspace's materials for a new chat, then ask (US-08 AC3). */
export default function NewChatPage() {
  const { workspaceId = '' } = useParams()
  const [search] = useSearchParams()
  const workspaceState = useWorkspace(workspaceId)
  const { documents, status } = useLibraryContext()

  if (workspaceState.status === 'loading' || status === 'loading') {
    return (
      <p role="status" className="text-muted">
        Opening your workspace…
      </p>
    )
  }
  if (workspaceState.status === 'missing') {
    return (
      <div>
        <h1 className={H1}>We can’t find that workspace</h1>
        <p className={LEDE}>
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
  const { workspace } = workspaceState
  return (
    <NewChat
      key={workspace.id}
      workspace={workspace}
      materials={documents.filter(({ workspaceId: id }) => id === workspace.id)}
      preselected={search.get('material')}
      initialQuestion={search.get('q') ?? ''}
    />
  )
}
