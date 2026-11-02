import { describe, expect, it } from 'vitest'
import { parseText } from './parse-text.js'

describe('parseText', () => {
  it('returns chunks that cite their line range', async () => {
    const file = new File(['intro\n\nsecond\nparagraph'], 'a.txt')
    const { chunks, pageCount } = await parseText(file)
    expect(pageCount).toBeNull()
    expect(chunks).toEqual([
      { text: 'intro', source: { type: 'lines', startLine: 1, endLine: 1 } },
      {
        text: 'second\nparagraph',
        source: { type: 'lines', startLine: 3, endLine: 4 },
      },
    ])
  })
})
