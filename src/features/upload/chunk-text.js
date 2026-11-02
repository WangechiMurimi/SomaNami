import { MAX_CHUNK_CHARS } from './constants.js'

/**
 * Splits text into paragraph-aligned chunks, each tagged with the 1-based line
 * range it came from so answers can cite where in the file a passage lives.
 */
export function chunkText(text, maxChars = MAX_CHUNK_CHARS) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const chunks = []
  let current = null

  const flush = () => {
    if (current) chunks.push(current)
    current = null
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    if (line.trim() === '') {
      flush()
      return
    }
    // A single oversized line (common in PDFs) still has to be split.
    const pieces =
      line.length > maxChars ? splitLongLine(line, maxChars) : [line]
    for (const piece of pieces) {
      if (current && current.text.length + piece.length + 1 > maxChars) flush()
      if (current) {
        current.text += `\n${piece}`
        current.endLine = lineNumber
      } else {
        current = { text: piece, startLine: lineNumber, endLine: lineNumber }
      }
    }
  })
  flush()
  return chunks
}

function splitLongLine(line, maxChars) {
  const pieces = []
  for (let i = 0; i < line.length; i += maxChars) {
    pieces.push(line.slice(i, i + maxChars))
  }
  return pieces
}
