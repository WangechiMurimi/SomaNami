import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDocument = vi.fn()

// pdf.js needs a real worker; stub it at the module boundary.
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: (...args) => getDocument(...args),
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: 'worker.js',
}))

const { parsePdf } = await import('./parse-pdf.js')

const fakePdf = (pages) => ({
  numPages: pages.length,
  destroy: vi.fn().mockResolvedValue(undefined),
  getPage: async (n) => ({
    getTextContent: async () => ({
      items: pages[n - 1].map((str) => ({ str, hasEOL: true })),
    }),
  }),
})

const pdfFile = () => new File([new Uint8Array([1, 2, 3])], 'a.pdf')

describe('parsePdf', () => {
  beforeEach(() => getDocument.mockReset())

  it('tags each chunk with its page number', async () => {
    const pdf = fakePdf([['Page one text'], ['Page two text']])
    getDocument.mockReturnValue({ promise: Promise.resolve(pdf) })

    const { chunks, pageCount } = await parsePdf(pdfFile())

    expect(pageCount).toBe(2)
    expect(chunks).toEqual([
      { text: 'Page one text', source: { type: 'page', page: 1 } },
      { text: 'Page two text', source: { type: 'page', page: 2 } },
    ])
    expect(pdf.destroy).toHaveBeenCalled()
  })

  it('skips pages without text', async () => {
    getDocument.mockReturnValue({
      promise: Promise.resolve(fakePdf([[''], ['Only here']])),
    })
    const { chunks } = await parsePdf(pdfFile())
    expect(chunks.map((c) => c.source.page)).toEqual([2])
  })
})
