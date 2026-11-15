import { afterEach, describe, expect, it } from 'vitest'
import { MAX_CHUNK_CHARS } from './constants.ts'
import { parseHtml } from './parse-html.ts'

const htmlFile = (body: BlobPart, type = 'text/html') =>
  new File([body], 'article.html', { type })

const sentence = (topic: string) =>
  `Photosynthesis turns light into chemical energy, and ${topic} explains how plants store it for later use in the cell.`

const ARTICLE = `<!doctype html>
<html><head><title>How plants eat | Science Weekly</title></head>
<body>
  <header><nav><a href="/">Home</a> <a href="/news">News</a> <a href="/about">About</a></nav></header>
  <main><article>
    <h1>How plants eat</h1>
    <p>${sentence('the light reaction')} ${sentence('chlorophyll')}</p>
    <p>${sentence('the Calvin cycle')} ${sentence('carbon fixation')}</p>
    <ul><li><p>${sentence('stomata')}</p></li><li>${sentence('glucose')}</li></ul>
  </article></main>
  <footer>Copyright Science Weekly. All rights reserved.</footer>
</body></html>`

const texts = (parsed: Awaited<ReturnType<typeof parseHtml>>) =>
  parsed.chunks.map((chunk) => chunk.text)

describe('parseHtml', () => {
  afterEach(() => {
    delete (globalThis as { __ran?: boolean }).__ran
  })

  it('extracts an article’s title and paragraphs, cited by paragraph', async () => {
    const parsed = await parseHtml(htmlFile(ARTICLE))

    expect(parsed.title).toMatch(/How plants eat/)
    expect(parsed.pageCount).toBeNull()
    expect(texts(parsed).join(' ')).toContain('the Calvin cycle')
    expect(texts(parsed).join(' ')).not.toMatch(/All rights reserved|About/)
    const paragraphs = parsed.chunks.map((chunk) => chunk.source)
    expect(paragraphs[0]).toEqual({ type: 'paragraph', paragraph: 1 })
    expect(paragraphs.at(-1)).toEqual({
      type: 'paragraph',
      paragraph: parsed.chunks.length,
    })
  })

  it('cites a list item that wraps a paragraph only once', async () => {
    const parsed = await parseHtml(htmlFile(ARTICLE))
    const stomata = texts(parsed).filter((text) => text.includes('stomata'))
    expect(stomata).toHaveLength(1)
  })

  it('splits a very long paragraph into bounded chunks with one citation', async () => {
    const long = Array.from({ length: 40 }, (_, i) => sentence(`step ${i}`))
    const page = `<html><head><title>Long read</title></head><body><article><p>${long.join(' ')}</p></article></body></html>`

    const parsed = await parseHtml(htmlFile(page))

    expect(parsed.chunks.length).toBeGreaterThan(1)
    for (const chunk of parsed.chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS)
      expect(chunk.source).toEqual({ type: 'paragraph', paragraph: 1 })
    }
  })

  it('falls back to body text without navigation on a page with no article', async () => {
    const page = `<html><head><title>Links</title></head><body>
      <nav><ul><li><a href="/a">Alpha</a></li><li><a href="/b">Beta</a></li></ul></nav>
      <header>Site banner</header>
      <div><p>Opening hours are nine to five.</p></div>
      <footer>Footer links</footer>
    </body></html>`

    const parsed = await parseHtml(htmlFile(page))

    expect(texts(parsed).join(' ')).toContain('Opening hours are nine to five.')
    expect(texts(parsed).join(' ')).not.toMatch(/Alpha|Site banner|Footer/)
  })

  it('finds no text in a page that only renders with JavaScript', async () => {
    const shell = `<!doctype html><html><head><title>App</title>
      <script src="/bundle.js"></script></head>
      <body><noscript>You need to enable JavaScript to run this app.</noscript>
      <div id="root"></div><script>document.body.innerHTML = '<p>Loaded</p>'</script>
      </body></html>`

    const parsed = await parseHtml(htmlFile(shell))

    expect(parsed.chunks).toEqual([])
  })

  it('never runs the page’s scripts or event handlers', async () => {
    const page = `<html><body><article>
      <script>globalThis.__ran = true</script>
      <img src="x" onerror="globalThis.__ran = true">
      <p onclick="globalThis.__ran = true">${sentence('inert parsing')}</p>
    </article></body></html>`

    const parsed = await parseHtml(htmlFile(page))
    // Event handlers and resource loads would fire asynchronously.
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect((globalThis as { __ran?: boolean }).__ran).toBeUndefined()
    expect(texts(parsed).join(' ')).not.toContain('__ran')
  })

  describe('decoding', () => {
    // "Café – naïve" in windows-1252: é=E9, en dash=96, ï=EF.
    const cp1252Body = [
      0x43, 0x61, 0x66, 0xe9, 0x20, 0x96, 0x20, 0x6e, 0x61, 0xef, 0x76, 0x65,
    ]
    const page = (head: string) =>
      new Uint8Array([
        ...new TextEncoder().encode(`<html><head>${head}</head><body><p>`),
        ...cp1252Body,
        ...new TextEncoder().encode('</p></body></html>'),
      ])

    it('uses the charset carried on the file type', async () => {
      const file = htmlFile(page(''), 'text/html; charset=windows-1252')
      expect(texts(await parseHtml(file))).toEqual(['Café – naïve'])
    })

    it('sniffs a <meta charset> when the type has none', async () => {
      const file = htmlFile(page('<meta charset="windows-1252">'))
      expect(texts(await parseHtml(file))).toEqual(['Café – naïve'])
    })

    it('sniffs an http-equiv Content-Type charset', async () => {
      const file = htmlFile(
        page(
          '<meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1">',
        ),
      )
      // ISO-8859-1 is decoded as windows-1252, as browsers do.
      expect(texts(await parseHtml(file))).toEqual(['Café – naïve'])
    })

    it('lets the HTTP charset win over a contradicting <meta>', async () => {
      const file = htmlFile(
        page('<meta charset="utf-8">'),
        'text/html; charset=windows-1252',
      )
      expect(texts(await parseHtml(file))).toEqual(['Café – naïve'])
    })

    it('defaults to UTF-8 and survives an unknown charset label', async () => {
      const utf8 = '<html><body><p>Café – naïve</p></body></html>'
      expect(texts(await parseHtml(htmlFile(utf8)))).toEqual(['Café – naïve'])
      const bogus = htmlFile(utf8, 'text/html; charset=not-a-charset')
      expect(texts(await parseHtml(bogus))).toEqual(['Café – naïve'])
    })
  })
})
