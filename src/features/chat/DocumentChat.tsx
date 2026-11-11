import { useCallback, useMemo } from 'react'
import { retrieveChunks } from '../../lib/retrieval/index.ts'
import type { Passage, StoredDocument } from '../../types/contracts.ts'
import ChatPanel from './ChatPanel.tsx'
import { useDocumentConversation } from './use-document-conversation.ts'

/**
 * Questions about one document: retrieves its passages for each question and
 * keeps the conversation saved on this device.
 */
export default function DocumentChat({
  document,
}: {
  document: StoredDocument
}) {
  const { status, initialMessages, record } = useDocumentConversation(document)
  const documents = useMemo(() => [document], [document])

  // Retrieval runs locally; only the selected passages travel to the server.
  const selectPassages = useCallback(
    (question: string): Passage[] =>
      retrieveChunks(question, documents).map(
        ({ documentId, chunkId, text, source }) => ({
          documentId,
          chunkId,
          text,
          source,
        }),
      ),
    [documents],
  )

  if (status === 'loading') {
    return (
      <p role="status" className="text-muted">
        Opening your conversation…
      </p>
    )
  }

  return (
    <>
      {status === 'error' && (
        <p className="text-sm text-muted">
          We couldn’t load your earlier questions about this document, but you
          can keep asking.
        </p>
      )}
      <ChatPanel
        documents={documents}
        selectPassages={selectPassages}
        initialMessages={initialMessages}
        onAnswered={record}
      />
    </>
  )
}
