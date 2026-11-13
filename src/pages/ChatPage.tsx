import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import {
  chatPath,
  newChatPath,
} from '../features/chat/conversation-materials.ts'
import { useLibraryContext } from '../features/library/library-context.ts'
import { listConversations } from '../lib/storage/index.ts'
import { H1, LEDE } from './page-heading.ts'

/**
 * The address chats used before they had their own: `/chat/<material id>`.
 * Kept so saved links still work; it opens the material's latest chat, or a
 * new chat with that material chosen.
 */
export default function ChatPage() {
  const { documentId = '' } = useParams()
  const { documents, status } = useLibraryContext()
  const document = documents.find(({ id }) => id === documentId)
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
    if (!document) return
    let cancelled = false
    listConversations(document.id).then(
      ([latest]) => {
        if (cancelled) return
        setTarget(
          latest
            ? chatPath(latest)
            : newChatPath(document.workspaceId, document.id),
        )
      },
      () => !cancelled && setTarget(newChatPath(document.workspaceId)),
    )
    return () => {
      cancelled = true
    }
  }, [document])

  if (target) return <Navigate to={target} replace />
  if (document || status === 'loading') {
    return (
      <p role="status" className="text-muted">
        Opening your library…
      </p>
    )
  }
  return (
    <div>
      <h1 className={H1}>We can’t find that material</h1>
      <p className={LEDE}>
        It may have been removed, or added on another device. For now, each
        device keeps its own materials and chats.{' '}
        <Link to="/library" className="font-semibold text-accent underline">
          Go to your library
        </Link>
      </p>
    </div>
  )
}
