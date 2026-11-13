import { useCallback } from 'react'
import { retrieveChunks } from '../../lib/retrieval/index.ts'
import type { Passage, StoredDocument } from '../../types/contracts.ts'
import ChatPanel from './ChatPanel.tsx'
import type { ChatTurn } from './use-chat.ts'
import type { ChatReply } from '../../types/contracts.ts'

/**
 * Questions within one saved conversation. Retrieval runs locally over the
 * conversation's own materials only; just the selected passages travel to
 * the server.
 */
export default function ConversationChat({
  workspaceId,
  materials,
  initialMessages,
  initialQuestion,
  onAnswered,
}: {
  workspaceId: string
  materials: StoredDocument[]
  initialMessages: ChatTurn[]
  initialQuestion?: string
  onAnswered: (exchange: {
    question: string
    reply: ChatReply
  }) => Promise<void>
}) {
  const selectPassages = useCallback(
    (question: string): Passage[] =>
      retrieveChunks(question, materials).map(
        ({ documentId, chunkId, text, source }) => ({
          documentId,
          chunkId,
          text,
          source,
        }),
      ),
    [materials],
  )

  return (
    <ChatPanel
      documents={materials}
      selectPassages={selectPassages}
      initialMessages={initialMessages}
      initialQuestion={initialQuestion}
      onAnswered={onAnswered}
      addMaterialTo={`/workspaces/${workspaceId}`}
    />
  )
}
