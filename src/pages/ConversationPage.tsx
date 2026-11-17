import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useBreadcrumbs } from '../app/breadcrumbs.ts'
import { Plus } from '../components/icons.tsx'
import Loading from '../components/Loading.tsx'
import NotFound from '../components/NotFound.tsx'
import ConversationChat from '../features/chat/ConversationChat.tsx'
import { materialsFor } from '../features/chat/conversation-materials.ts'
import SaveToggle from '../features/chat/SaveToggle.tsx'
import { useConversation } from '../features/chat/use-conversation.ts'
import KindIcon from '../features/library/KindIcon.tsx'
import { useLibraryContext } from '../features/library/library-context.ts'
import { useWorkspace } from '../features/workspaces/use-workspace.ts'
import { isLooseWorkspace } from '../lib/storage/index.ts'
import type { StoredDocument } from '../types/contracts.ts'

/** The question a chat was started with on Home or New chat, if any. */
const startingQuestion = (state: unknown): string | undefined =>
  typeof state === 'object' &&
  state !== null &&
  'question' in state &&
  typeof state.question === 'string' &&
  state.question
    ? state.question
    : undefined

function Conversation({
  conversationId,
  documents,
}: {
  conversationId: string
  documents: StoredDocument[]
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const { state, record } = useConversation(conversationId, documents)
  // Read once: the history entry is cleared below so a reload doesn't ask again.
  const [question] = useState(() => startingQuestion(location.state))
  const workspaceId =
    state.status === 'loading' || state.status === 'missing'
      ? ''
      : state.conversation.workspaceId
  const workspace = useWorkspace(workspaceId)
  // A loose chat (started from Home or the Library) belongs to no workspace.
  const loose = workspaceId !== '' && isLooseWorkspace(workspaceId)
  const addMaterialTo = loose ? '/library' : `/workspaces/${workspaceId}`

  useEffect(() => {
    if (question) navigate(location.pathname, { replace: true, state: null })
  }, [question, navigate, location.pathname])

  const conversation =
    state.status === 'ready' || state.status === 'history-error'
      ? state.conversation
      : null
  const materials = useMemo(
    () => (conversation ? materialsFor(conversation, documents) : []),
    [conversation, documents],
  )
  useBreadcrumbs([
    ...(loose ? [] : [{ label: 'Workspaces', to: '/workspaces' }]),
    ...(workspace.status === 'ready' && !loose
      ? [
          {
            label: workspace.workspace.name,
            to: `/workspaces/${workspace.workspace.id}`,
          },
        ]
      : []),
    ...(conversation ? [{ label: conversation.title }] : []),
  ])

  if (state.status === 'loading') {
    return <Loading>Opening your conversation…</Loading>
  }
  if (state.status === 'missing' || !conversation) {
    return (
      <NotFound
        title="We can’t find that chat"
        note="It may have been removed."
        linkTo="/conversations"
        linkLabel="See your saved conversations"
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[65rem] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl leading-[1.3] font-semibold break-words">
          {conversation.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <SaveToggle conversation={conversation} />
          <Link
            to={addMaterialTo}
            className="inline-flex h-11 flex-none items-center gap-2 rounded-[10px] border border-edge bg-surface px-4 text-sm font-medium text-fg hover:bg-tint"
          >
            <Plus size={15} strokeWidth={2.4} />
            Add materials
          </Link>
        </div>
      </div>
      {materials.length > 0 && (
        <ul aria-label="Sources in this chat" className="flex flex-wrap gap-2">
          {materials.map((material) => (
            <li
              key={material.id}
              className="flex min-h-8 max-w-full items-center gap-1.5 rounded-full bg-tint px-3 py-1 text-[0.8125rem] leading-[1.5] font-medium break-all text-accent"
            >
              <KindIcon kind={material.kind} size={14} />
              {material.name}
            </li>
          ))}
        </ul>
      )}
      {state.status === 'history-error' && (
        <p className="text-sm text-muted">
          We couldn’t load your earlier questions in this chat, but you can keep
          asking.
        </p>
      )}
      {materials.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-muted">
          The materials this chat used have been removed, so it can’t answer new
          questions.
        </p>
      ) : (
        <ConversationChat
          addMaterialTo={addMaterialTo}
          materials={materials}
          initialMessages={state.initialMessages}
          initialQuestion={question}
          onAnswered={record}
        />
      )}
    </div>
  )
}

/** One saved conversation, addressed by its id. */
export default function ConversationPage() {
  const { conversationId = '' } = useParams()
  const { documents, status } = useLibraryContext()

  // Citations name their materials, so wait for the library before loading.
  if (status === 'loading') {
    return <Loading>Opening your conversation…</Loading>
  }
  return (
    <Conversation
      key={conversationId}
      conversationId={conversationId}
      documents={documents}
    />
  )
}
