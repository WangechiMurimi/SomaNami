import { describe, expect, it } from 'vitest'
import { chunkText } from './chunk-text.js'

describe('chunkText', () => {
  it('splits on blank lines and records 1-based line ranges', () => {
    expect(chunkText('one\ntwo\n\nthree')).toEqual([
      { text: 'one\ntwo', startLine: 1, endLine: 2 },
      { text: 'three', startLine: 4, endLine: 4 },
    ])
  })

  it('handles CRLF line endings', () => {
    expect(chunkText('a\r\n\r\nb')).toHaveLength(2)
  })

  it('returns nothing for blank input', () => {
    expect(chunkText('  \n\n \n')).toEqual([])
  })

  it('starts a new chunk when a paragraph would exceed the limit', () => {
    const chunks = chunkText('aaaa\nbbbb\ncccc', 9)
    expect(chunks.map((c) => c.text)).toEqual(['aaaa\nbbbb', 'cccc'])
    expect(chunks[1]).toMatchObject({ startLine: 3, endLine: 3 })
  })

  it('splits a single line longer than the limit', () => {
    const chunks = chunkText('x'.repeat(25), 10)
    expect(chunks.map((c) => c.text.length)).toEqual([10, 10, 5])
  })
})
