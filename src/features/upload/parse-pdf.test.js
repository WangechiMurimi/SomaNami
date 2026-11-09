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

// Mirrors pdf.js v6 shapes: the document proxy has no destroy(); only the
// loading task does. A fake that adds one hid a bug that broke every PDF.
const fakePdf = (pages) => ({
  numPages: pages.length,
  getPage: async (n) => ({
    getTextContent: async () => ({
      items: pages[n - 1].map((str) => ({ str, hasEOL: true })),
    }),
  }),
})

const loadingTask = (open) => ({
  promise: open(),
  destroy: vi.fn().mockResolvedValue(undefined),
})

const pdfFile = () => new File([new Uint8Array([1, 2, 3])], 'a.pdf')

describe('parsePdf', () => {
  beforeEach(() => getDocument.mockReset())

  it('tags each chunk with its page number and releases the document', async () => {
    const task = loadingTask(async () =>
      fakePdf([['Page one text'], ['Page two text']]),
    )
    getDocument.mockReturnValue(task)

    const { chunks, pageCount } = await parsePdf(pdfFile())

    expect(pageCount).toBe(2)
    expect(chunks).toEqual([
      { text: 'Page one text', source: { type: 'page', page: 1 } },
      { text: 'Page two text', source: { type: 'page', page: 2 } },
    ])
    expect(task.destroy).toHaveBeenCalled()
  })

  it('skips pages without text', async () => {
    getDocument.mockReturnValue(
      loadingTask(async () => fakePdf([[''], ['Only here']])),
    )
    const { chunks } = await parsePdf(pdfFile())
    expect(chunks.map((c) => c.source.page)).toEqual([2])
  })

  it('lets a parse failure escape and still releases the worker', async () => {
    const task = loadingTask(async () => {
      throw new Error('InvalidPDFException')
    })
    getDocument.mockReturnValue(task)

    await expect(parsePdf(pdfFile())).rejects.toThrow('InvalidPDFException')
    expect(task.destroy).toHaveBeenCalled()
  })
})
