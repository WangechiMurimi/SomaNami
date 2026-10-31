export const MAX_FILE_BYTES = 20 * 1024 * 1024

/** Extensions we can parse in the browser today, mapped to a parser kind. */
export const SUPPORTED_EXTENSIONS = {
  pdf: 'pdf',
  txt: 'text',
  md: 'text',
}

/** Formats the design lists but we don't parse yet; named so the error is honest. */
export const PLANNED_EXTENSIONS = ['doc', 'docx', 'ppt', 'pptx']

export const ACCEPT_ATTRIBUTE = Object.keys(SUPPORTED_EXTENSIONS)
  .map((ext) => `.${ext}`)
  .join(',')

/** Upper bound for a chunk so later retrieval gets passages, not whole pages. */
export const MAX_CHUNK_CHARS = 1200
