import type {
  ChunkRef,
  Passage,
  Source,
  StoredDocument,
} from '../../types/contracts.ts'

/** A citation resolved to something a reader can recognise. */
export interface ResolvedCitation {
  key: string
  label: string
  text: string | undefined
}

/** Human-readable location of a passage, matching how each parser cites it. */
export function describeSource(source: Source): string {
  if (source.type === 'page') return `Page ${source.page}`
  if (source.type === 'paragraph') return `Paragraph ${source.paragraph}`
  return source.startLine === source.endLine
    ? `Line ${source.startLine}`
    : `Lines ${source.startLine}–${source.endLine}`
}

// Chunk ids are unique across documents, so the id alone is a stable key.
const keyOf = ({ chunkId }: ChunkRef): string => chunkId

/**
 * Turns `{ documentId, chunkId }` citations into labels naming a real document
 * and location, resolved against the passages that were sent with the question.
 */
export function resolveCitations(
  citations: readonly ChunkRef[] = [],
  passages: readonly Passage[] = [],
  documents: readonly Pick<StoredDocument, 'id' | 'name'>[] = [],
): ResolvedCitation[] {
  const names = new Map(documents.map(({ id, name }) => [id, name]))
  const byKey = new Map(passages.map((p) => [keyOf(p), p]))
  const seen = new Set<string>()

  return citations.flatMap((citation) => {
    const key = keyOf(citation)
    // The model can cite the same passage for several claims; show it once.
    if (seen.has(key)) return []
    seen.add(key)

    const passage = byKey.get(key)
    const name = names.get(citation.documentId)
    const where = passage ? describeSource(passage.source) : 'Unknown passage'
    return [
      { key, label: name ? `${name} · ${where}` : where, text: passage?.text },
    ]
  })
}
