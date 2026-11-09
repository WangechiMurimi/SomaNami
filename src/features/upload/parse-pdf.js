import { chunkText } from './chunk-text.js'
import { loadReader } from './load-reader.js'

/** pdf.js is large, so load it only when a PDF is actually uploaded. */
async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

/** Reads a PDF in the browser into chunks located by page number. */
export async function parsePdf(file) {
  const pdfjs = await loadReader(loadPdfjs)
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() })
  const chunks = []

  try {
    const pdf = await loadingTask.promise
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items
        .map((item) => item.str + (item.hasEOL ? '\n' : ' '))
        .join('')
      for (const chunk of chunkText(text)) {
        chunks.push({
          text: chunk.text.replace(/[ \t]+/g, ' ').trim(),
          source: { type: 'page', page: pageNumber },
        })
      }
    }
    return { chunks, pageCount: pdf.numPages }
  } finally {
    // pdf.js v6 only exposes destroy() on the loading task, not the document.
    // Calling it here also frees the worker when the PDF fails to open.
    await loadingTask.destroy()
  }
}
