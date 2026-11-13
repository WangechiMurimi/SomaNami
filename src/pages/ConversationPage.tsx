import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Lock } from '../components/icons.tsx'
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
          It may have been removed, or saved on another device.{' '}
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
    <div className="mx-auto flex max-w-[54rem] flex-col gap-7">
      {workspace.status === 'ready' && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <li>
              <Link
                to={`/workspaces/${workspace.workspace.id}`}
                className="hover:text-fg hover:underline"
              >
                {workspace.workspace.name}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="min-w-0 truncate text-fg">
              {conversation.title}
            </li>
          </ol>
        </nav>
      )}
      <div>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-tint px-3 py-1.5 text-[13px] text-accent">
          <Lock size={14} />
          Locked to your content
        </p>
        <h1 className={`${H1} mt-4 break-words`}>{conversation.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-muted">
          <span>Using</span>
          <ul aria-label="Materials this chat uses" className="contents">
            {materials.map((material) => (
              <li
                key={material.id}
                className="rounded-full border border-line bg-surface px-3 py-1 text-fg"
              >
                {material.name}
              </li>
            ))}
          </ul>
          {materials.length === 0 && <span>no materials</span>}
        </div>
      </div>
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
