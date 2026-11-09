import type { RetrievedPassage } from '../../types/contracts.ts'
import { buildIndex } from './build-index.ts'
import type { IndexableDocument } from './build-index.ts'
import { tokenize } from './tokenize.ts'

const DEFAULT_LIMIT = 5

// Standard BM25 parameters: k1 controls how fast repeated terms stop adding
// score, b how strongly long chunks are penalised. These are the values Robertson
// reports as robust across corpora, and our chunks are uniform enough (capped at
// MAX_CHUNK_CHARS) that there is no reason to tune away from them.
const K1 = 1.5
const B = 0.75

/**
 * Relevance floor, part 1: a hit must score at least this share of the best
 * score the query could possibly achieve.
 *
 * WHY 0.12: scores are normalised against the query's own saturation ceiling
 * (every term present, repeated, in a short chunk), so the ratio answers "how
 * much of what this question asks for does this passage actually contain?"
 * A chunk that merely shares one mid-frequency word with a multi-word question
 * lands around 0.05-0.10; a chunk that genuinely covers the question's subject
 * lands above 0.3. 0.12 sits in that gap, slightly below the midpoint so that a
 * short, dense passage answering only part of the question still survives. The
 * cost of the two errors is asymmetric: a weak extra passage is something the
 * model can ignore, while dropping the only relevant passage produces a wrong
 * "cannot be answered" (#25), so the floor is deliberately set low rather than
 * at the visually cleaner 0.2.
 */
const MIN_RELEVANCE_RATIO = 0.12

/**
 * Relevance floor, part 2: a hit must match at least this share of the query's
 * distinct content terms, counting the terms the corpus does not contain.
 *
 * WHY 1/3: the ratio above is blind to how a score was earned, so one rare word
 * repeated often can carry a passage over it on its own — exactly the accidental
 * keyword collision ("cell phone battery" against a biology text) that produces
 * a confidently wrong answer. Requiring a third of the terms means one- and
 * two-word queries must match every term, while longer questions (whose extra
 * terms are usually phrasing, not subject) stay answerable.
 */
const MIN_TERM_COVERAGE = 1 / 3

// The "+1" IDF variant, which stays positive even for a term present in every
// chunk. A term in all chunks is weak evidence, not negative evidence, and the
// plain formula's negative weights would let such a term subtract from a hit.
function inverseDocumentFrequency(
  documentFrequency: number,
  chunkCount: number,
): number {
  return Math.log(
    1 + (chunkCount - documentFrequency + 0.5) / (documentFrequency + 0.5),
  )
}

/**
 * Ranks the chunks of `documents` against a natural-language `query` with BM25,
 * returning at most `limit` hits by descending score, or `[]` when none of them
 * clears the relevance floor.
 */
export function retrieveChunks(
  query: string,
  documents: readonly IndexableDocument[],
  { limit = DEFAULT_LIMIT }: { limit?: number } = {},
): RetrievedPassage[] {
  if (!Array.isArray(documents) || documents.length === 0) return []
  if (!Number.isFinite(limit) || limit < 1) return []

  const queryTerms = [...new Set(tokenize(query))]
  if (queryTerms.length === 0) return []

  const index = buildIndex(documents)
  if (index.chunkCount === 0 || index.averageLength === 0) return []

  // Terms absent from the corpus are excluded from the scoring ceiling — they
  // can never be matched, so leaving them in would deflate every ratio — but
  // they still count towards the coverage requirement below, because a question
  // whose subject is missing from the corpus is precisely the unanswerable case.
  const weights = queryTerms
    .map((term) => ({
      term,
      idf: inverseDocumentFrequency(
        index.documentFrequency.get(term) ?? 0,
        index.chunkCount,
      ),
    }))
    .filter(({ term }) => index.documentFrequency.has(term))
  if (weights.length === 0) return []

  const maxScore = weights.reduce((sum, { idf }) => sum + idf * (K1 + 1), 0)
  const requiredMatches = Math.ceil(queryTerms.length * MIN_TERM_COVERAGE)

  const hits: RetrievedPassage[] = []
  for (const posting of index.postings) {
    let score = 0
    let matched = 0
    for (const { term, idf } of weights) {
      const frequency = posting.termFrequencies.get(term)
      if (!frequency) continue
      matched += 1
      const normalisation =
        K1 * (1 - B + (B * posting.length) / index.averageLength)
      score += (idf * (frequency * (K1 + 1))) / (frequency + normalisation)
    }

    const relevance = score / maxScore
    if (matched < requiredMatches || relevance < MIN_RELEVANCE_RATIO) continue
    hits.push({
      documentId: posting.documentId,
      chunkId: posting.chunkId,
      text: posting.text,
      source: posting.source,
      score: relevance,
    })
  }

  // Ties are broken by position so results are stable across identical queries.
  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, limit)
}
