// Tests for the document validation used by the upload zone in SomaNami.html.
// Run with `npm test` (Node's built-in test runner; no extra dependencies).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const html = await readFile(new URL('./SomaNami.html', import.meta.url), 'utf8')
const source = html.match(/<script id="upload-validation">([\s\S]*?)<\/script>/)?.[1]
assert.ok(source, 'SomaNami.html should contain <script id="upload-validation">')
const SomaUpload = vm.runInThisContext(`(() => {${source}\nreturn SomaUpload})()`)
const { validateFile, formatSize, MAX_BYTES, ACCEPT } = SomaUpload

const bytes = (...parts) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)))
const file = (name, content, type = '') => new File([content], name, { type })

const PDF = bytes('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n')
// Minimal stand-in for a .docx: a zip whose entries include word/document.xml.
const DOCX = bytes('PK\x03\x04', [20, 0, 0, 0], '[Content_Types].xml', '...', 'PK\x03\x04', 'word/document.xml', '...')
const PNG = bytes([0x89], 'PNG\r\n\x1a\n', [0, 0, 0, 13], 'IHDR')
const OLE = bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], [0, 0, 0, 0])

const expectOk = async (f, kind) => {
  const r = await validateFile(f)
  assert.equal(r.ok, true, r.message)
  assert.equal(r.kind, kind)
}
const expectFail = async (f, code, mentions = f?.name) => {
  const r = await validateFile(f)
  assert.equal(r.ok, false, `expected ${f?.name} to be rejected`)
  assert.equal(r.code, code)
  assert.ok(r.message.length > 0)
  if (mentions) assert.ok(r.message.includes(mentions), `message should name the file: ${r.message}`)
}

test('accepts real PDF, DOCX and TXT files', async () => {
  await expectOk(file('notes.pdf', PDF, 'application/pdf'), 'pdf')
  await expectOk(file('handout.docx', DOCX), 'docx')
  await expectOk(file('article.txt', 'Squash and stretch gives a ball weight.', 'text/plain'), 'txt')
})

test('matches extensions case-insensitively and ignores the browser MIME type', async () => {
  await expectOk(file('SCAN.PDF', PDF), 'pdf') // empty MIME, common on Windows
  await expectOk(file('Week 2.Notes.DocX', DOCX, 'application/octet-stream'), 'docx')
})

test('accepts UTF-16 text files (which contain NUL bytes)', async () => {
  await expectOk(file('utf16.txt', bytes([0xff, 0xfe], 'H', [0], 'i', [0])), 'txt')
})

test('rejects unsupported types with a message listing what is supported', async () => {
  for (const name of ['photo.png', 'slides.pptx', 'notes.md', 'archive.zip']) {
    await expectFail(file(name, PNG), 'unsupported-type')
  }
  const r = await validateFile(file('photo.png', PNG))
  assert.match(r.message, /PDF, Word \(\.docx\) or text \(\.txt\)/)
})

test('rejects files with no extension', async () => {
  await expectFail(file('README', 'hello'), 'unsupported-type')
})

test('explains how to fix legacy .doc files', async () => {
  const r = await validateFile(file('old.doc', OLE))
  assert.equal(r.code, 'legacy-doc')
  assert.match(r.message, /save it as \.docx/)
})

test('does not trust the extension: renamed files are rejected', async () => {
  await expectFail(file('image.pdf', PNG, 'application/pdf'), 'content-mismatch')
  await expectFail(file('image.docx', PNG), 'content-mismatch')
  await expectFail(file('image.txt', PNG, 'text/plain'), 'content-mismatch')
})

test('rejects a zip that is not a Word document', async () => {
  await expectFail(file('fake.docx', bytes('PK\x03\x04', [20, 0], 'xl/workbook.xml')), 'content-mismatch')
})

test('flags password-protected or legacy-format .docx files', async () => {
  await expectFail(file('locked.docx', OLE), 'protected-docx')
})

test('rejects empty and whitespace-only files', async () => {
  await expectFail(file('blank.pdf', ''), 'empty')
  await expectFail(file('blank.txt', ' \n\t\r\n '), 'empty')
})

test('rejects files over 20 MB without reading them', async () => {
  const huge = {
    name: 'big.pdf',
    size: MAX_BYTES + 1,
    slice: () => assert.fail('should not read oversized files'),
  }
  const r = await validateFile(huge)
  assert.equal(r.code, 'too-large')
  assert.match(r.message, /20\.0 MB.*up to 20 MB/)
})

test('accepts a file exactly at the 20 MB limit', async () => {
  const big = new Uint8Array(MAX_BYTES)
  big.set(PDF)
  await expectOk(file('limit.pdf', big), 'pdf')
})

test('reports unreadable files (e.g. moved after selection) instead of throwing', async () => {
  const gone = {
    name: 'moved.pdf',
    size: 10,
    slice: () => ({ arrayBuffer: () => Promise.reject(new DOMException('NotReadableError')) }),
  }
  await expectFail(gone, 'unreadable')
})

test('handles a missing file', async () => {
  await expectFail(undefined, 'missing', null)
})

test('formats sizes the way the file card shows them', () => {
  assert.equal(formatSize(10), '1 KB')
  assert.equal(formatSize(300 * 1024), '300 KB')
  assert.equal(formatSize(2.5 * 1024 * 1024), '2.5 MB')
})

test('the file input accept list matches the validator', () => {
  const accept = html.match(/<input type="file" id="fileIn" accept="([^"]+)"/)?.[1]
  assert.equal(accept, ACCEPT)
})
