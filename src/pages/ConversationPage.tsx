import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useBreadcrumbs } from '../app/breadcrumbs.ts'
import { Lock, Plus } from '../components/icons.tsx'
import ConversationChat from '../features/chat/ConversationChat.tsx'
import { materialsFor } from '../features/chat/conversation-materials.ts'
import { useConversation } from '../features/chat/use-conversation.ts'
import { useLibraryContext } from '../features/library/library-context.ts'
import { useWorkspace } from '../features/workspaces/use-workspace.ts'
import type { StoredDocument } from '../types/contracts.ts'
import { H1, LEDE } from './page-heading.ts'

/** The question a chat was started with on New chat, if any. */
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
    { label: 'Workspaces', to: '/workspaces' },
    ...(workspace.status === 'ready'
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
    return (
      <p role="status" className="text-muted">
        Opening your conversation…
      </p>
    )
  }
  if (state.status === 'missing' || !conversation) {
    return (
      <div>
        <h1 className={H1}>We can’t find that chat</h1>
        <p className={LEDE}>
          It may have been removed, or added on another device. For now, each
          device keeps its own materials and chats.{' '}
          <Link
            to="/conversations"
            className="font-semibold text-accent underline"
          >
            See your saved conversations
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[65rem] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl leading-[1.3] font-semibold break-words">
          {conversation.title}
        </h1>
        <Link
          to={`/workspaces/${conversation.workspaceId}`}
          className="inline-flex h-11 flex-none items-center gap-2 rounded-[10px] border border-edge bg-surface px-4 text-sm font-medium text-fg hover:bg-tint"
        >
          <Plus size={15} strokeWidth={2.4} />
          Add materials
        </Link>
      </div>
      <p className="flex flex-wrap items-center gap-1.5 self-start rounded-[18px] bg-tint px-3 py-1.5 text-[13px] leading-[1.5] font-medium text-accent">
        <Lock size={14} strokeWidth={1.9} />
        {materials.length === 0 ? (
          'No materials left in this chat'
        ) : (
          <>
            Using
            <ul aria-label="Materials this chat uses" className="contents">
              {materials.map((material) => (
                <li
                  key={material.id}
                  className="break-all not-last:after:content-[',']"
                >
                  {material.name}
                </li>
              ))}
            </ul>
            {materials.length === 1 && 'only'}
          </>
        )}
      </p>
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
          workspaceId={conversation.workspaceId}
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
    return (
      <p role="status" className="text-muted">
        Opening your conversation…
      </p>
    )
  }
  return (
    <Conversation
      key={conversationId}
      conversationId={conversationId}
      documents={documents}
    />
  )
}
