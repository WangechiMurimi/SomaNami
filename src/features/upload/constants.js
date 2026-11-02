export const MAX_FILE_BYTES = 20 * 1024 * 1024

/** Extensions we can parse in the browser today, mapped to a parser kind. */
export const SUPPORTED_EXTENSIONS = {
  pdf: 'pdf',
  docx: 'docx',
  txt: 'text',
  md: 'text',
}

/** Formats the design lists but we don't parse yet; named so the error is honest. */
export const PLANNED_EXTENSIONS = ['doc', 'ppt', 'pptx']

/** Shared by the drop-zone hint and the type error so the two can't drift. */
export const SUPPORTED_LABEL = 'PDF, DOCX, TXT or Markdown'

/**
 * Only a hint for the native file picker: drag-and-drop and the picker's
 * "All files" option both bypass it, so validation must not rely on it.
 */
export const ACCEPT_ATTRIBUTE = Object.keys(SUPPORTED_EXTENSIONS)
  .map((ext) => `.${ext}`)
  .join(',')

/** How many leading bytes `verifyContents` reads to sniff a file's real type. */
export const SNIFF_BYTES = 4096

/** Upper bound for a chunk so later retrieval gets passages, not whole pages. */
export const MAX_CHUNK_CHARS = 1200
