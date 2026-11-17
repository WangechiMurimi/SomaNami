// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { clearIndexCache } from '../../src/lib/retrieval/index.ts'
import type { IndexableDocument } from '../../src/lib/retrieval/index.ts'
import { FALLBACK_PASSAGE_LIMIT, selectPassages } from './select-passages.ts'

const material = (id: string, texts: string[]): IndexableDocument => ({
  id,
  chunks: texts.map((text, index) => ({
    id: `${id}:${index}`,
    text,
    source: { type: 'page', page: index + 1 },
  })),
})

const biology = material('bio', [
  'Cell biology: an introduction to the parts of a cell.',
  'Mitochondria produce ATP through cellular respiration.',
  'Ribosomes assemble proteins from messenger RNA.',
  'The nucleus stores most of the DNA.',
])

const plants = material('plants', [
  'Plants: how green organisms capture light.',
  'Photosynthesis happens in chloroplasts.',
])

const ids = (passages: { chunkId: string }[]) =>
  passages.map(({ chunkId }) => chunkId)

describe('selectPassages', () => {
  beforeEach(() => {
    clearIndexCache()
  })

  it('uses strict hits alone when retrieval finds the subject', () => {
    expect(
      ids(selectPassages('What do ribosomes assemble?', [biology])),
    ).toEqual(['bio:2'])
  })

  it('returns plain passages without retrieval scores', () => {
    const [passage] = selectPassages('ribosomes proteins', [biology])
    expect(passage).not.toHaveProperty('score')
  })

  it('gives a request with no subject words the opening of every material', () => {
    expect(
      ids(selectPassages('Summarize this for me', [biology, plants])),
    ).toEqual(['bio:0', 'plants:0', 'bio:1', 'plants:1', 'bio:2', 'bio:3'])
  })

  it('puts loose matches ahead of the opening passages', () => {
    const passages = selectPassages(
      'Give me a fun everyday analogy for what the nucleus is like',
      [biology],
    )
    expect(ids(passages)[0]).toBe('bio:3')
    expect(new Set(ids(passages)).size).toBe(passages.length)
  })

  it('resolves a follow-up through the previous exchange', () => {
    const passages = selectPassages(
      'Simpler, please',
      [biology, plants],
      [
        { role: 'user', content: 'Where does photosynthesis happen?' },
        { role: 'assistant', content: 'In the chloroplasts.' },
      ],
    )
    expect(ids(passages)[0]).toBe('plants:1')
  })

  it('caps the fallback at the passage limit', () => {
    const long = material(
      'long',
      Array.from(
        { length: 20 },
        (_, index) => `Section ${index} of the notes.`,
      ),
    )
    expect(selectPassages('Quiz me', [long])).toHaveLength(
      FALLBACK_PASSAGE_LIMIT,
    )
  })

  it('returns nothing when the materials have no text', () => {
    expect(selectPassages('Summarize this', [material('empty', [])])).toEqual(
      [],
    )
  })
})
