import { beforeEach, describe, expect, it } from 'vitest'
import { clearIndexCache } from './build-index.ts'
import { retrieveChunks } from './retrieve-chunks.ts'
import type { Chunk, NewDocument } from '../../types/contracts.ts'

const makeDocument = (
  id: string,
  chunks: Omit<Chunk, 'id'>[],
): NewDocument => ({
  id,
  name: `${id}.txt`,
  size: 1000,
  kind: 'text',
  pageCount: null,
  chunks: chunks.map((chunk, index) => ({ id: `${id}:${index}`, ...chunk })),
})

const biology = makeDocument('doc-biology', [
  {
    text: 'Mitochondria are the organelles where cellular respiration produces ATP, the energy currency every cell spends.',
    source: { type: 'page', page: 4 },
  },
  {
    text: 'Photosynthesis converts light into chemical bonds inside the chloroplast, storing energy as glucose.',
    source: { type: 'page', page: 5 },
  },
  {
    text: 'The plasma membrane is a phospholipid bilayer that controls which molecules enter and leave.',
    source: { type: 'page', page: 6 },
  },
  {
    text: 'Ribosomes assemble proteins from messenger RNA transcripts read three bases at a time.',
    source: { type: 'page', page: 7 },
  },
  {
    text: 'Chapter summary and review questions for the unit on cell structure.',
    source: { type: 'page', page: 8 },
  },
  {
    text: 'Glossary of terms used throughout this chapter, listed alphabetically.',
    source: { type: 'page', page: 9 },
  },
])

const astronomy = makeDocument('doc-astronomy', [
  {
    text: 'Tides are driven by the gravitational pull of the moon on the oceans of the Earth.',
    source: { type: 'paragraph', paragraph: 1 },
  },
  {
    text: 'A solar eclipse happens when the moon passes directly between the Earth and the sun.',
    source: { type: 'line', startLine: 12, endLine: 18 },
  },
])

describe('retrieveChunks', () => {
  beforeEach(() => {
    clearIndexCache()
  })

  it('ranks the chunk that answers the question first', () => {
    const hits = retrieveChunks(
      'How do mitochondria produce ATP during respiration?',
      [biology],
    )

    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]).toMatchObject({
      documentId: 'doc-biology',
      chunkId: 'doc-biology:0',
    })
  })

  it('orders hits by descending score', () => {
    const hits = retrieveChunks('energy in the cell', [biology])
    const scores = hits.map((hit) => hit.score)

    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    expect(hits.every((hit) => hit.score > 0)).toBe(true)
  })

  it('returns no hits when the documents cannot answer the question', () => {
    expect(
      retrieveChunks('How do I file an income tax return?', [
        biology,
        astronomy,
      ]),
    ).toEqual([])
  })

  it('rejects an accidental keyword collision', () => {
    // "cell" appears in the biology text, but nothing else in the query does.
    expect(
      retrieveChunks('cell phone battery charging times', [biology]),
    ).toEqual([])
  })

  it('respects the limit, defaulting to five', () => {
    const repetitive = makeDocument(
      'doc-repetitive',
      Array.from({ length: 8 }, (_, index) => ({
        text: `Section ${index} explains how enzymes catalyse reactions.`,
        source: { type: 'paragraph', paragraph: index + 1 },
      })),
    )

    expect(retrieveChunks('enzymes', [repetitive])).toHaveLength(5)
    expect(retrieveChunks('enzymes', [repetitive], { limit: 2 })).toHaveLength(
      2,
    )
    expect(retrieveChunks('enzymes', [repetitive], { limit: 20 })).toHaveLength(
      8,
    )
  })

  it('attributes each hit to the document it came from', () => {
    const hits = retrieveChunks(
      'What does the moon do to the oceans, and what does ATP do for a cell?',
      [biology, astronomy],
      { limit: 10 },
    )
    const documentIds = new Set(hits.map((hit) => hit.documentId))

    expect(documentIds).toEqual(new Set(['doc-biology', 'doc-astronomy']))
    for (const hit of hits) {
      const document = [biology, astronomy].find(
        (candidate) => candidate.id === hit.documentId,
      )
      const chunk = document?.chunks.find(({ id }) => id === hit.chunkId)
      expect(chunk?.text).toBe(hit.text)
    }
  })

  it('passes source references through unchanged', () => {
    const [hit] = retrieveChunks('solar eclipse between Earth and sun', [
      astronomy,
    ])

    expect(hit?.source).toEqual({ type: 'line', startLine: 12, endLine: 18 })
    expect(hit?.source).toBe(astronomy.chunks[1]?.source)
  })

  it('returns page sources from paginated documents', () => {
    const [hit] = retrieveChunks('phospholipid bilayer membrane', [biology])

    expect(hit?.source).toEqual({ type: 'page', page: 6 })
  })

  it('returns the same results for a repeated query on a reused index', () => {
    const query = 'how is glucose stored by photosynthesis'

    expect(retrieveChunks(query, [biology])).toEqual(
      retrieveChunks(query, [biology]),
    )
  })

  it('returns nothing for empty input', () => {
    expect(retrieveChunks('', [biology])).toEqual([])
    expect(retrieveChunks('what is the of and', [biology])).toEqual([])
    expect(retrieveChunks('mitochondria', [])).toEqual([])
    // Untyped callers can still pass nothing; the guard must hold at runtime.
    expect(
      retrieveChunks('mitochondria', undefined as unknown as NewDocument[]),
    ).toEqual([])
    expect(retrieveChunks('mitochondria', [biology], { limit: 0 })).toEqual([])
  })

  it('ignores documents with no chunks', () => {
    expect(retrieveChunks('mitochondria', [makeDocument('empty', [])])).toEqual(
      [],
    )
  })
})
