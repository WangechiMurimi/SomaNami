import { beforeEach, describe, expect, it } from 'vitest'
import { buildIndex, clearIndexCache } from './build-index.js'

const makeDocument = (id, texts) => ({
  id,
  name: `${id}.txt`,
  size: 100,
  kind: 'text',
  pageCount: undefined,
  chunks: texts.map((text, index) => ({
    id: index,
    text,
    source: { type: 'paragraph', paragraph: index + 1 },
  })),
})

describe('buildIndex', () => {
  beforeEach(() => {
    clearIndexCache()
  })

  it('creates one posting per chunk, carrying its source reference', () => {
    const index = buildIndex([
      makeDocument('doc-a', ['Photosynthesis in plants', 'Cell respiration']),
    ])

    expect(index.chunkCount).toBe(2)
    expect(index.postings[1]).toMatchObject({
      documentId: 'doc-a',
      chunkId: 1,
      source: { type: 'paragraph', paragraph: 2 },
    })
  })

  it('counts document frequency across every document', () => {
    const index = buildIndex([
      makeDocument('doc-a', ['energy flows', 'energy stores']),
      makeDocument('doc-b', ['energy budgets', 'unrelated prose']),
    ])

    expect(index.documentFrequency.get('energy')).toBe(3)
    expect(index.chunkCount).toBe(4)
    expect(index.averageLength).toBeGreaterThan(0)
  })

  it('reuses the assembled index for the same documents', () => {
    const documents = [makeDocument('doc-a', ['energy flows'])]
    const first = buildIndex(documents)

    // A fresh array of the same documents, as a React render would produce.
    expect(buildIndex([...documents])).toBe(first)
  })

  it('reuses per-document postings when the document set changes', () => {
    const a = makeDocument('doc-a', ['energy flows'])
    const b = makeDocument('doc-b', ['unrelated prose'])
    const both = buildIndex([a, b])
    const onlyA = buildIndex([a])

    expect(onlyA).not.toBe(both)
    expect(onlyA.postings[0]).toBe(both.postings[0])
  })

  it('handles an empty document set', () => {
    const index = buildIndex([])
    expect(index.chunkCount).toBe(0)
    expect(index.averageLength).toBe(0)
  })
})
