import { useCallback, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useBreadcrumbs } from '../app/breadcrumbs.ts'
import Composer from '../components/Composer.tsx'
import ErrorAlert from '../components/ErrorAlert.tsx'
import { Plus } from '../components/icons.tsx'
import Loading from '../components/Loading.tsx'
import NotFound from '../components/NotFound.tsx'
import { useRecentConversations } from '../features/chat/use-recent-conversations.ts'
import { useStartChat } from '../features/chat/use-start-chat.ts'
import { useLibraryContext } from '../features/library/library-context.ts'
import AddMaterialsPanel from '../features/workspaces/AddMaterialsPanel.tsx'
import MaterialChecklist from '../features/workspaces/MaterialChecklist.tsx'
import WorkspaceActionDialog from '../features/workspaces/WorkspaceActionDialog.tsx'
import WorkspaceChatList from '../features/workspaces/WorkspaceChatList.tsx'
import { useWorkspace } from '../features/workspaces/use-workspace.ts'
import { useWorkspaceUpload } from '../features/workspaces/use-workspace-upload.ts'
import { isLooseWorkspace } from '../lib/storage/index.ts'
import type { StoredDocument, Workspace } from '../types/contracts.ts'
import { H2 } from './page-heading.ts'

const HEADER_BUTTON =
  'inline-flex h-11 items-center gap-2 rounded-[10px] border border-edge bg-surface px-4 text-sm font-medium text-fg hover:bg-tint'

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
          <WorkspaceChatList chats={chats} documents={documents} />
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
          <MaterialChecklist
            materials={materials}
            excluded={excluded}
            onToggle={toggle}
            onExcludedChange={setExcluded}
          />
        </section>
      </div>

      {error && <ErrorAlert>{error}</ErrorAlert>}

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
    return <Loading>Opening your workspace…</Loading>
  }
  if (state.status === 'missing') {
    return (
      <NotFound
        title="We can’t find that workspace"
        note="It may have been removed."
        linkTo="/workspaces"
        linkLabel="See your workspaces"
      />
    )
  }
  return <WorkspaceView key={state.workspace.id} workspace={state.workspace} />
}
