import {
  MAX_FILE_BYTES,
  PLANNED_EXTENSIONS,
  SUPPORTED_EXTENSIONS,
} from './constants.js'

const getExtension = (name) => {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

const fail = (code, message) => ({ ok: false, error: { code, message } })

/** Checks type, size and emptiness before any parsing; returns `{ ok, kind }` or `{ ok: false, error }`. */
export function validateFile(file) {
  const ext = getExtension(file.name)

  if (PLANNED_EXTENSIONS.includes(ext)) {
    return fail(
      'unsupported-planned',
      `.${ext} files aren't supported yet. Save it as a PDF or text file and try again.`,
    )
  }
  if (!(ext in SUPPORTED_EXTENSIONS)) {
    return fail(
      'unsupported-type',
      'We can only read PDF, TXT and Markdown files right now.',
    )
  }
  if (file.size === 0) {
    return fail('empty', 'That file is empty.')
  }
  if (file.size > MAX_FILE_BYTES) {
    return fail('too-large', 'That file is over the 20 MB limit.')
  }
  return { ok: true, kind: SUPPORTED_EXTENSIONS[ext] }
}
