import type { Chunk, Passage, StoredDocument } from '../../types/contracts.ts'
import { countTerms, tokenize } from './tokenize.ts'

/** One chunk's term statistics, carried with the passage it came from. */
export interface Posting extends Passage {
  termFrequencies: Map<string, number>
  length: number
}

export interface LexicalIndex {
  postings: Posting[]
  documentFrequency: Map<string, number>
  chunkCount: number
  averageLength: number
}

/** The subset of a document retrieval reads; stored documents satisfy it. */
export type IndexableDocument = Pick<StoredDocument, 'id' | 'chunks'>

interface DocumentEntry {
  chunks: Chunk[]
  postings: Posting[]
}

// Tokenizing is the expensive part of retrieval and documents are immutable
// once parsed, so per-document postings are memoized against the document
// object itself; the entry is discarded when the document is garbage collected.
const documentCache = new WeakMap<IndexableDocument, DocumentEntry>()

// The corpus statistics depend on the whole set, so the assembled index is
// cached separately. One entry is enough: the UI asks repeated questions about
// the same open document set, it does not interleave sets.
let lastIndex: {
  documents: IndexableDocument[]
  index: LexicalIndex
} | null = null

function indexDocument(document: IndexableDocument): DocumentEntry {
  const cached = documentCache.get(document)
  // `chunks` identity guards against a document rebuilt in place.
  if (cached && cached.chunks === document.chunks) return cached

  const entry: DocumentEntry = {
    chunks: document.chunks,
    postings: document.chunks.map((chunk) => {
      const terms = tokenize(chunk.text)
      return {
        documentId: document.id,
        chunkId: chunk.id,
        text: chunk.text,
        source: chunk.source,
        termFrequencies: countTerms(terms),
        length: terms.length,
      }
    }),
  }
  documentCache.set(document, entry)
  return entry
}

function sameDocuments(
  a: readonly IndexableDocument[],
  b: readonly IndexableDocument[],
): boolean {
  return a.length === b.length && a.every((document, i) => document === b[i])
}

/**
 * Builds (or reuses) the lexical index over `documents`: one posting per chunk
 * plus the corpus statistics BM25 needs.
 */
export function buildIndex(
  documents: readonly IndexableDocument[],
): LexicalIndex {
  if (lastIndex && sameDocuments(lastIndex.documents, documents)) {
    return lastIndex.index
  }

  const postings = documents.flatMap(
    (document) => indexDocument(document).postings,
  )
  const documentFrequency = new Map<string, number>()
  let totalLength = 0

  for (const posting of postings) {
    totalLength += posting.length
    for (const term of posting.termFrequencies.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
    }
  }

  const index: LexicalIndex = {
    postings,
    documentFrequency,
    chunkCount: postings.length,
    averageLength: postings.length === 0 ? 0 : totalLength / postings.length,
  }
  lastIndex = { documents: [...documents], index }
  return index
}

/** Clears the memoized index; exported for tests and for document deletion. */
export function clearIndexCache(): void {
  lastIndex = null
}
