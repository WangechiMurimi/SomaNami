import {
  MAX_FILE_BYTES,
  PLANNED_EXTENSIONS,
  SNIFF_BYTES,
  SUPPORTED_EXTENSIONS,
  SUPPORTED_LABEL,
} from './constants.js'

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d] // "%PDF-"
const ZIP_HEADER = [0x50, 0x4b, 0x03, 0x04] // every .docx is a ZIP package
// OLE compound file: legacy .doc, and also how Word stores an encrypted .docx.
const OLE_HEADER = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
// The PDF spec tolerates leading bytes before the header within the first 1 KB.
const PDF_HEADER_WINDOW = 1024

const getExtension = (name) => {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

const fail = (code, message) => ({ ok: false, error: { code, message } })
const pass = { ok: true }

const startsWith = (bytes, header) => header.every((b, i) => bytes[i] === b)

const contains = (bytes, needle) => {
  for (let i = 0; i <= bytes.length - needle.length; i++) {
    if (startsWith(bytes.subarray(i), needle)) return true
  }
  return false
}

/** Checks name and size before any bytes are read; returns `{ ok, kind }` or `{ ok: false, error }`. */
export function validateFile(file) {
  const ext = getExtension(file.name)

  if (PLANNED_EXTENSIONS.includes(ext)) {
    return fail(
      'unsupported-planned',
      `.${ext} files aren't supported yet. Save it as a PDF, DOCX or text file and try again.`,
    )
  }
  if (!(ext in SUPPORTED_EXTENSIONS)) {
    return fail(
      'unsupported-type',
      `We can only read ${SUPPORTED_LABEL} files right now.`,
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

const mismatch = (claimed) =>
  fail(
    'content-mismatch',
    `This file is named as ${claimed}, but its contents don’t match. It may have been renamed or damaged.`,
  )

/** Signature checks on a file's leading bytes, one per parser kind. */
const CONTENT_CHECKS = {
  pdf: (bytes) =>
    contains(bytes.subarray(0, PDF_HEADER_WINDOW), PDF_HEADER)
      ? pass
      : mismatch('a PDF'),
  docx: (bytes) => {
    if (startsWith(bytes, ZIP_HEADER)) return pass
    if (startsWith(bytes, OLE_HEADER)) {
      return fail(
        'docx-protected-or-legacy',
        'This Word file is password-protected or saved in the older .doc format. Remove the password or re-save it as .docx and try again.',
      )
    }
    return mismatch('a Word document')
  },
  // NUL bytes never appear in UTF-8 text, so they reliably flag binary files.
  text: (bytes) => (bytes.includes(0) ? mismatch('a text file') : pass),
}

/**
 * Confirms a file's contents match the kind its extension claims. Names and
 * the picker's `accept` filter are trivial to bypass, so this is what actually
 * stands between an arbitrary file and the parsers.
 */
export async function verifyContents(file, kind) {
  const head = await file.slice(0, SNIFF_BYTES).arrayBuffer()
  return CONTENT_CHECKS[kind](new Uint8Array(head))
}
