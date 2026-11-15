import { Readability } from '@mozilla/readability'
import { chunkText } from './chunk-text.ts'
import type { ParsedFile } from './parsed-file.ts'

/** Elements whose text is one paragraph to a reader; `li > p` counts once, as the `p`. */
const BLOCK_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, figcaption, dt, dd, td, th'

/**
 * Never article text. Readability keeps menus when a page is short, and
 * <noscript> holds "enable JavaScript" notices because DOMParser runs no script.
 */
const NON_CONTENT_SELECTOR =
  'nav, [role="navigation"], script, style, noscript, template'

/**
 * Also dropped when Readability finds no article. Not removed up front: an
 * article's own <header> often holds its headline.
 */
const CHROME_SELECTOR = `${NON_CONTENT_SELECTOR}, header, footer, aside`

const removeAll = (root: ParentNode, selector: string) =>
  root.querySelectorAll(selector).forEach((node) => node.remove())

// Browsers look for a <meta> charset in the first 1024 bytes; so do we.
const META_SNIFF_BYTES = 1024
const UTF8_BOM = [0xef, 0xbb, 0xbf]

const charsetFromMimeType = (type: string): string | undefined =>
  /charset\s*=\s*["']?([\w.:-]+)/i.exec(type)?.[1]

/** Finds `<meta charset>` or an `http-equiv="Content-Type"` charset in the page head. */
function charsetFromMeta(bytes: Uint8Array): string | undefined {
  // latin1 maps every byte to one char, so ASCII markup reads correctly
  // whatever the real encoding turns out to be.
  const head = new TextDecoder('latin1').decode(
    bytes.subarray(0, META_SNIFF_BYTES),
  )
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const charset = /charset\s*=\s*["']?([\w.:-]+)/i.exec(tag)?.[1]
    if (charset) return charset
  }
  return undefined
}

function makeDecoder(label: string | undefined): TextDecoder {
  try {
    return new TextDecoder(label ?? 'utf-8')
  } catch {
    // An unknown label (typo, made-up encoding) is common on the web; UTF-8
    // is the best guess and garbles at most the non-ASCII characters.
    return new TextDecoder('utf-8')
  }
}

/**
 * Decodes page bytes the way a browser would: a BOM wins, then the HTTP
 * charset (carried on `file.type`), then `<meta>`, then UTF-8.
 */
function decodeHtml(bytes: Uint8Array, mimeType: string): string {
  const hasBom = UTF8_BOM.every((b, i) => bytes[i] === b)
  const label = hasBom
    ? 'utf-8'
    : (charsetFromMimeType(mimeType) ?? charsetFromMeta(bytes))
  return makeDecoder(label).decode(bytes)
}

const blockText = (element: Element): string =>
  element.tagName === 'PRE'
    ? (element.textContent ?? '')
    : (element.textContent ?? '').replace(/\s+/g, ' ').trim()

/** Splits a container into reader paragraphs, innermost blocks only, so nested text isn't repeated. */
function paragraphsOf(root: Element): string[] {
  const blocks = [...root.querySelectorAll(BLOCK_SELECTOR)].filter(
    (block) => !block.querySelector(BLOCK_SELECTOR),
  )
  // Text in bare <div>s has no block to hang on; keep it as one paragraph
  // rather than losing it.
  const texts = blocks.length > 0 ? blocks.map(blockText) : [blockText(root)]
  return texts.filter((text) => text.trim() !== '')
}

/** Body text minus navigation and other chrome, for pages Readability can't read. */
function fallbackParagraphs(doc: Document): string[] {
  const body = doc.body
  if (!body) return []
  removeAll(body, CHROME_SELECTOR)
  return paragraphsOf(body)
}

/** Reads a saved or fetched web page into its article's paragraphs, cited by paragraph number. */
export async function parseHtml(file: File): Promise<ParsedFile> {
  const html = decodeHtml(new Uint8Array(await file.arrayBuffer()), file.type)
  // DOMParser builds an inert document: scripts never run and nothing loads.
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const pageTitle = doc.title.trim()
  removeAll(doc, NON_CONTENT_SELECTOR)

  // Readability mutates the document it reads, so give it a copy and keep
  // the original for the fallback.
  const article = new Readability<Node>(doc.cloneNode(true) as Document, {
    // Hand back the article's DOM node instead of an HTML string, which
    // would otherwise need parsing a second time.
    serializer: (node) => node,
  }).parse()

  const content = article?.content
  let paragraphs = content instanceof Element ? paragraphsOf(content) : []
  if (paragraphs.length === 0) paragraphs = fallbackParagraphs(doc)

  const chunks: ParsedFile['chunks'] = []
  paragraphs.forEach((paragraph, index) => {
    for (const { text } of chunkText(paragraph)) {
      chunks.push({ text, source: { type: 'paragraph', paragraph: index + 1 } })
    }
  })

  const title = article?.title?.trim() || pageTitle
  return { chunks, pageCount: null, ...(title && { title }) }
}
