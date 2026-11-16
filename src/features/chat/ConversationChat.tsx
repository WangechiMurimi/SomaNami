import { useMemo } from 'react'
import type { ChatReply, StoredDocument } from '../../types/contracts.ts'
import ChatPanel from './ChatPanel.tsx'
import type { ChatTurn } from './use-chat.ts'

/**
 * Questions within one saved conversation. Only the ids of the conversation's
 * own materials travel to the server, which loads and ranks their passages
 * from the learner's cloud copy (#148), so retrieval never crosses into other
 * materials (US-08 AC3).
 */
export default function ConversationChat({
  addMaterialTo,
  materials,
  initialMessages,
  initialQuestion,
  onAnswered,
}: {
  /** Where to add material when a question goes unanswered. */
  addMaterialTo: string
  materials: StoredDocument[]
  initialMessages: ChatTurn[]
  initialQuestion?: string
  onAnswered: (exchange: {
    question: string
    reply: ChatReply
  }) => Promise<void>
}) {
  const materialIds = useMemo(() => materials.map(({ id }) => id), [materials])

  return (
    <ChatPanel
      documents={materials}
      materialIds={materialIds}
      initialMessages={initialMessages}
      initialQuestion={initialQuestion}
      onAnswered={onAnswered}
      addMaterialTo={addMaterialTo}
    />
  )
}
