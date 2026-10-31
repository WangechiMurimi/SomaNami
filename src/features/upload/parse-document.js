import { parsePdf } from './parse-pdf.js'
import { parseText } from './parse-text.js'
import { validateFile } from './validate-file.js'

const PARSERS = { pdf: parsePdf, text: parseText }

export class UploadError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/** Validates and parses a file into a document with source-referenced chunks; throws `UploadError`. */
export async function parseDocument(file) {
  const validation = validateFile(file)
  if (!validation.ok) {
    throw new UploadError(validation.error.code, validation.error.message)
  }

  let parsed
  try {
    parsed = await PARSERS[validation.kind](file)
  } catch {
    throw new UploadError(
      'parse-failed',
      "We couldn't read that file. It may be damaged or password-protected.",
    )
  }

  if (parsed.chunks.length === 0) {
    throw new UploadError(
      'no-text',
      'We found no readable text. Scanned documents need text recognition, which we don’t support yet.',
    )
  }

  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    kind: validation.kind,
    pageCount: parsed.pageCount,
    chunks: parsed.chunks.map((chunk, index) => ({ id: index, ...chunk })),
  }
}
