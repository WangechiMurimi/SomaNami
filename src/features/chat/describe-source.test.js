import { describe, expect, it } from 'vitest'
import { describeSource, resolveCitations } from './describe-source.js'

describe('describeSource', () => {
  it('names each passage location the parsers produce', () => {
    expect(describeSource({ type: 'page', page: 3 })).toBe('Page 3')
    expect(describeSource({ type: 'paragraph', paragraph: 2 })).toBe(
      'Paragraph 2',
    )
    expect(describeSource({ type: 'line', startLine: 5, endLine: 5 })).toBe(
      'Line 5',
    )
    expect(describeSource({ type: 'line', startLine: 5, endLine: 9 })).toBe(
      'Lines 5–9',
    )
  })
})

describe('resolveCitations', () => {
  const passages = [
    {
      documentId: 'doc-1',
      chunkId: 1,
      text: 'Photosynthesis converts light.',
      source: { type: 'page', page: 7 },
    },
  ]
  const documents = [{ id: 'doc-1', name: 'biology.pdf' }]

  it('labels a citation with its document name and location', () => {
    expect(
      resolveCitations(
        [{ documentId: 'doc-1', chunkId: 1 }],
        passages,
        documents,
      ),
    ).toEqual([
      {
        key: 'doc-1:1',
        label: 'biology.pdf · Page 7',
        text: 'Photosynthesis converts light.',
      },
    ])
  })

  it('shows a repeated citation once', () => {
    const citations = [
      { documentId: 'doc-1', chunkId: 1 },
      { documentId: 'doc-1', chunkId: 1 },
    ]
    expect(resolveCitations(citations, passages, documents)).toHaveLength(1)
  })

  it('falls back to the chunk id when the passage is unknown', () => {
    expect(
      resolveCitations(
        [{ documentId: 'doc-9', chunkId: 4 }],
        passages,
        documents,
      ),
    ).toEqual([{ key: 'doc-9:4', label: 'Passage 4', text: undefined }])
  })
})
