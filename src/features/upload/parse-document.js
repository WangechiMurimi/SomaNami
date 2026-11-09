import { parseDocx } from './parse-docx.js'
import { parsePdf } from './parse-pdf.js'
import { parseText } from './parse-text.js'
import { UploadError } from './upload-error.js'
import { validateFile, verifyContents } from './validate-file.js'

export { UploadError }

/** One parser per kind in `SUPPORTED_EXTENSIONS`; exported so a test can enforce that. */
export const PARSERS = { pdf: parsePdf, docx: parseDocx, text: parseText }

const rejectFile = ({ code, message }) =>
  new UploadError(code, message, { stage: 'validation' })

/** Validates and parses a file into a document with source-referenced chunks; throws `UploadError`. */
export async function parseDocument(file) {
  const validation = validateFile(file)
  if (!validation.ok) throw rejectFile(validation.error)

  const parse = PARSERS[validation.kind]
  // Checked outside the try below: a missing parser is a bug and must fail
  // loudly, not be reported to the user as a damaged file.
  if (!parse) throw new Error(`No parser registered for "${validation.kind}"`)

  let parsed
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

  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    kind: validation.kind,
    pageCount: parsed.pageCount,
    chunks: parsed.chunks.map((chunk, index) => ({ id: index, ...chunk })),
  }
}
