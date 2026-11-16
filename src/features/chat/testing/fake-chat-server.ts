import { vi } from 'vitest'
import { retrieveChunks } from '../../../lib/retrieval/index.ts'
import { getDocument } from '../../../lib/storage/index.ts'
import type {
  ChatReply,
  ChatRequest,
  CitedPassage,
  StoredDocument,
} from '../../../types/contracts.ts'

/**
 * Stands in for `POST /api/chat` in UI tests. It ranks the named materials
 * from the local store the way the server ranks their synced cloud copies
 * (#148), then lets the test decide the reply. Returns every request sent.
 */
export function serveChatFromStore(
  respond: (retrieved: CitedPassage[], request: ChatRequest) => ChatReply,
): ChatRequest[] {
  const requests: ChatRequest[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as ChatRequest
    requests.push(request)
    const documents = (
      await Promise.all(request.materialIds.map((id) => getDocument(id)))
    ).filter((document): document is StoredDocument => Boolean(document))
    const names = new Map(documents.map(({ id, name }) => [id, name]))
    const retrieved = retrieveChunks(request.question, documents).map(
      ({ documentId, chunkId, text, source }) => ({
        documentId,
        chunkId,
        text,
        source,
        documentName: names.get(documentId) ?? '',
      }),
    )
    return Response.json(respond(retrieved, request))
  })
  return requests
}

/** A reply citing the best passage, or "not covered" when nothing matched. */
export const citeBest =
  (answer: string) =>
  (retrieved: CitedPassage[]): ChatReply => {
    const best = retrieved[0]
    if (!best) {
      return {
        answer: 'Your documents don’t seem to cover this.',
        answerable: false,
        citations: [],
        passages: [],
      }
    }
    return {
      answer,
      answerable: true,
      citations: [{ documentId: best.documentId, chunkId: best.chunkId }],
      passages: [best],
    }
  }
