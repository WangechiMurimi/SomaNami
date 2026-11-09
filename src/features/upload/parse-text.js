import { chunkText } from './chunk-text.js'

/** Reads a plain-text or Markdown file into chunks located by line range. */
export async function parseText(file) {
  const text = await file.text()
  const chunks = chunkText(text).map(({ text: body, startLine, endLine }) => ({
    text: body,
    source: { type: 'lines', startLine, endLine },
  }))
  return { chunks, pageCount: null }
}
