import { describe, expect, it, vi } from 'vitest'
import { parseDocx } from './parse-docx.js'

const extractRawText = vi.fn()

// Stubbed to pin down paragraph numbering; App.test.jsx covers real mammoth.
// Default-only, matching the CommonJS chunk Vite emits for the browser.
vi.mock('mammoth', () => ({ default: { extractRawText } }))

const docx = () => new File([new Uint8Array([0x50, 0x4b, 3, 4])], 'a.docx')

describe('parseDocx', () => {
  it('tags each chunk with its paragraph number, skipping empty paragraphs', async () => {
    // mammoth's raw text ends each paragraph with a blank line.
    extractRawText.mockResolvedValue({
      value: 'Heading\n\nFirst point\n\n\n\nAfter an empty paragraph\n\n',
    })

    const { chunks, pageCount } = await parseDocx(docx())

    expect(pageCount).toBeNull()
    expect(chunks).toEqual([
      { text: 'Heading', source: { type: 'paragraph', paragraph: 1 } },
      { text: 'First point', source: { type: 'paragraph', paragraph: 2 } },
      {
        text: 'After an empty paragraph',
        source: { type: 'paragraph', paragraph: 4 },
      },
    ])
    expect(extractRawText).toHaveBeenCalledWith({
      arrayBuffer: expect.any(ArrayBuffer),
    })
  })
})
