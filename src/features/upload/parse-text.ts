import { chunkText } from './chunk-text.ts'
import type { ParsedFile } from './parsed-file.ts'

/** Reads a plain-text or Markdown file into chunks located by line range. */
export async function parseText(file: File): Promise<ParsedFile> {
  const text = await file.text()
  const chunks = chunkText(text).map(({ text: body, startLine, endLine }) => ({
    text: body,
    source: { type: 'line' as const, startLine, endLine },
  }))
  return { chunks, pageCount: null }
}
