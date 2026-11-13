import { parseDocx } from './parse-docx.ts'
import { parsePdf } from './parse-pdf.ts'
import { parseText } from './parse-text.ts'
import type { Parser, ParsedFile } from './parsed-file.ts'
import { UploadError } from './upload-error.ts'
import { validateFile, verifyContents } from './validate-file.ts'
import type { FileProblem } from './validate-file.ts'
import type { DocumentKind, StoredDocument } from '../../types/contracts.ts'

export { UploadError }

/** One parser per kind in `SUPPORTED_EXTENSIONS`; exported so a test can enforce that. */
export const PARSERS: Record<DocumentKind, Parser> = {
  pdf: parsePdf,
  docx: parseDocx,
  text: parseText,
}

const rejectFile = ({ code, message }: FileProblem) =>
  new UploadError(code, message, { stage: 'validation' })

/** Chunk ids embed their document id so they are unique across documents. */
export const chunkIdFor = (documentId: string, index: number): string =>
  `${documentId}:${index}`

/** Validates and parses a file into a document with source-referenced chunks; throws `UploadError`. */
export async function parseDocument(file: File): Promise<StoredDocument> {
  const validation = validateFile(file)
  if (!validation.ok) throw rejectFile(validation.error)

  const parse = PARSERS[validation.kind]
  // Checked outside the try below: a missing parser is a bug and must fail
  // loudly, not be reported to the user as a damaged file.
  if (!parse) throw new Error(`No parser registered for "${validation.kind}"`)

  let parsed: ParsedFile
  try {
    const contents = await verifyContents(file, validation.kind)
    if (!contents.ok) throw rejectFile(contents.error)
    parsed = await parse(file)
  } catch (error) {
    if (error instanceof UploadError) throw error
    throw new UploadError(
      'parse-failed',
      "We couldn't read that file. It may be damaged or password-protected.",
      { cause: error },
    )
  }

  if (parsed.chunks.length === 0) {
    throw new UploadError(
      'no-text',
      'We found no readable text. Scanned documents need text recognition, which we don’t support yet.',
    )
  }

  const id = crypto.randomUUID()
  return {
    id,
    name: file.name,
    size: file.size,
    kind: validation.kind,
    pageCount: parsed.pageCount,
    chunks: parsed.chunks.map((chunk, index) => ({
      id: chunkIdFor(id, index),
      ...chunk,
    })),
  }
}
