import { chunkText } from './chunk-text.js'
import { loadReader } from './load-reader.js'

/** Reads a Word document into chunks located by paragraph number. */
export async function parseDocx(file) {
  // mammoth bundles a ZIP reader, so load it only when a DOCX is uploaded.
  // It is CommonJS: the bundled chunk exposes its API only as `default`.
  const { default: mammoth } = await loadReader(() => import('mammoth'))
  const { value } = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  })

  // DOCX pages only exist once Word lays the text out, so cite paragraphs.
  // mammoth ends every paragraph with a blank line, which gives the split.
  const chunks = []
  value.split('\n\n').forEach((paragraph, index) => {
    for (const { text } of chunkText(paragraph)) {
      chunks.push({ text, source: { type: 'paragraph', paragraph: index + 1 } })
    }
  })
  return { chunks, pageCount: null }
}
