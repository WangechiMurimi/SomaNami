import { retrieveChunks } from '../../src/lib/retrieval/index.ts'
import type { IndexableDocument } from '../../src/lib/retrieval/index.ts'
import type { HistoryTurn, Passage } from '../../src/types/contracts.ts'

/**
 * Most passages sent when strict retrieval finds nothing. Chunks are capped at
 * 1,200 characters, so this keeps a fallback prompt around 10k characters.
 */
export const FALLBACK_PASSAGE_LIMIT = 8

/** Of the fallback passages, how many may come from loose term matching. */
const LOOSE_MATCH_LIMIT = 5

/**
 * Picks the passages the model answers from.
 *
 * Strict BM25 hits are used when there are any. Otherwise the question is
 * usually still about the material, just not in its words: a request with no
 * subject terms ("summarize this", "quiz me"), a paraphrase, or a follow-up
 * ("simpler, please"). Rather than declaring it unanswerable on lexical
 * grounds, the model gets the closest loose matches (using the previous turn
 * to resolve follow-ups) plus the opening of each material, and judges
 * coverage itself. The citation check in `handleChat` still decides what is
 * shown as sourced.
 */
export function selectPassages(
  question: string,
  materials: readonly IndexableDocument[],
  history: readonly HistoryTurn[] = [],
): Passage[] {
  const strict = retrieveChunks(question, materials)
  if (strict.length > 0) return strict.map(toPassage)

  const loose = retrieveChunks(
    withRecentContext(question, history),
    materials,
    {
      limit: LOOSE_MATCH_LIMIT,
      strict: false,
    },
  ).map(toPassage)

  const selected = new Map(loose.map((passage) => [passage.chunkId, passage]))
  for (const passage of openingPassages(materials)) {
    if (selected.size >= FALLBACK_PASSAGE_LIMIT) break
    if (!selected.has(passage.chunkId)) selected.set(passage.chunkId, passage)
  }
  return [...selected.values()]
}

// The last exchange names the subject a follow-up refers to ("and the second
// one?"), so its terms are added to the loose query only.
function withRecentContext(
  question: string,
  history: readonly HistoryTurn[],
): string {
  const lastUser = history.findLast((turn) => turn.role === 'user')
  const lastAssistant = history.findLast((turn) => turn.role === 'assistant')
  return [lastUser?.content, lastAssistant?.content, question]
    .filter(Boolean)
    .join('\n')
}

// Interleaves the first chunks of every material, so a summary or overview
// request sees each one's opening (usually its title and introduction) rather
// than all of the first material.
function* openingPassages(
  materials: readonly IndexableDocument[],
): Generator<Passage> {
  const longest = Math.max(0, ...materials.map(({ chunks }) => chunks.length))
  for (let position = 0; position < longest; position += 1) {
    for (const material of materials) {
      const chunk = material.chunks[position]
      if (chunk) {
        yield {
          documentId: material.id,
          chunkId: chunk.id,
          text: chunk.text,
          source: chunk.source,
        }
      }
    }
  }
}

function toPassage({ documentId, chunkId, text, source }: Passage): Passage {
  return { documentId, chunkId, text, source }
}
