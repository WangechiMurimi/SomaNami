/** Longest file name we suggest; long enough for real titles, short enough for any file system. */
export const MAX_FILE_NAME_CHARS = 120

// The browser picks a parser by extension, so a known type must carry one of
// its extensions: `/wiki/Node.js` served as HTML has to become `Node.js.html`.
// The first entry is the one added.
const EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  'application/pdf': ['pdf'],
  'text/html': ['html', 'htm'],
  'application/xhtml+xml': ['html', 'htm', 'xhtml'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    'docx',
  ],
  'text/plain': ['txt', 'md'],
  'text/markdown': ['md', 'txt'],
}

/**
 * Suggests a safe file name for fetched bytes: the upstream
 * `Content-Disposition` name, else the last URL path segment, else the host,
 * with an extension matching `mediaType` when that type is known.
 */
export function linkFileName(
  contentDisposition: string | undefined,
  finalUrl: URL,
  mediaType: string,
): string {
  const candidates = [
    dispositionName(contentDisposition),
    lastPathSegment(finalUrl),
    finalUrl.hostname.replace(/^\[|\]$/g, '').replace(/:/g, '-'),
  ]
  const base =
    candidates.map((name) => (name ? sanitize(name) : '')).find(Boolean) ??
    'download'
  return withExtension(base, mediaType)
}

function dispositionName(header: string | undefined): string | undefined {
  if (!header) return undefined
  // RFC 6266 prefers the encoded `filename*` form when both are present.
  const encoded = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(header)?.[1]
  if (encoded) {
    const decoded = safeDecode(encoded.trim())
    if (decoded) return decoded
  }
  const plain = /filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]*))/i.exec(header)
  if (!plain) return undefined
  return plain[1] !== undefined
    ? plain[1].replace(/\\(.)/g, '$1')
    : plain[2]?.trim()
}

function lastPathSegment(url: URL): string | undefined {
  const segment = url.pathname.split('/').filter(Boolean).at(-1)
  return segment ? (safeDecode(segment) ?? segment) : undefined
}

function safeDecode(text: string): string | undefined {
  try {
    return decodeURIComponent(text)
  } catch {
    return undefined
  }
}

function sanitize(name: string): string {
  const cleaned = name
    // Control and format characters: bidi overrides can disguise an extension.
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    // Path separators would let a name climb out of wherever it is saved.
    .replace(/[/\\]/g, '_')
    .trim()
    // Leading dots would make a hidden file or a `..` segment.
    .replace(/^[.\s]+/, '')
  return truncate(cleaned)
}

function truncate(name: string): string {
  const chars = Array.from(name)
  if (chars.length <= MAX_FILE_NAME_CHARS) return name
  const extension = /\.[^.]{1,10}$/.exec(name)?.[0] ?? ''
  const keep = MAX_FILE_NAME_CHARS - extension.length
  return chars.slice(0, keep).join('').trimEnd() + extension
}

function withExtension(name: string, mediaType: string): string {
  const allowed = EXTENSIONS[mediaType]
  if (!allowed) return name
  const current = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase()
  if (current && allowed.includes(current)) return name
  return truncate(`${name}.${allowed[0]}`)
}
