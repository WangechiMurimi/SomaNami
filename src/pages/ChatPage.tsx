import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import Loading from '../components/Loading.tsx'
import NotFound from '../components/NotFound.tsx'
import {
  chatPath,
  newChatPath,
} from '../features/chat/conversation-materials.ts'
import { useLibraryContext } from '../features/library/library-context.ts'
import { listConversations } from '../lib/storage/index.ts'

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
    return <Loading>Opening your library…</Loading>
  }
  return (
    <NotFound
      title="We can’t find that material"
      note="It may have been removed."
      linkTo="/library"
      linkLabel="Go to your library"
    />
  )
}
