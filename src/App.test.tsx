import { readFileSync } from 'node:fs'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { createMemoryAdapter, setStorageAdapter } from './lib/storage/index.ts'
import type { StorageAdapter } from './lib/storage/index.ts'
import type { ChatReply, ChatRequest } from './types/contracts.ts'
import { parsePdf } from './features/upload/parse-pdf.ts'
import type { ParsedFile } from './features/upload/parsed-file.ts'
import { UploadError } from './features/upload/upload-error.ts'

// pdf.js can't run in jsdom; the PDF parser has its own unit tests.
vi.mock('./features/upload/parse-pdf.ts', () => ({ parsePdf: vi.fn() }))

// A minimal real Word document, so the DOCX path runs through actual mammoth.
// Resolved from the Vitest root: jsdom replaces `import.meta.url` with an http URL.
const DOCX_FIXTURE = readFileSync(
  'src/features/upload/fixtures/bouncing-ball.docx',
)

const input = () => screen.getByLabelText('Upload a document')
const pdf = (name = 'week-2.pdf') => new File(['%PDF-1.7\n'], name)
const parsedPdf: ParsedFile = {
  chunks: [{ text: 'Squash and stretch', source: { type: 'page', page: 1 } }],
  pageCount: 1,
}

// A fresh store per test, so documents saved by one test never leak into the next.
beforeEach(() => setStorageAdapter(createMemoryAdapter()))

describe('document upload', () => {
  beforeEach(() => vi.mocked(parsePdf).mockReset())

  it('lists DOCX among the supported formats', () => {
    render(<App />)
    expect(
      screen.getByText('PDF, DOCX, TXT or Markdown, up to 20 MB'),
    ).toBeInTheDocument()
    expect(input()).toHaveAttribute('accept', '.pdf,.docx,.txt,.md')
  })

  it('shows a ready state with passage count after a valid upload', async () => {
    render(<App />)
    const file = new File(['first\n\nsecond'], 'class-notes.txt', {
      type: 'text/plain',
    })
    await userEvent.upload(input(), file)

    expect(await screen.findByText('✓ Ready to explore')).toBeInTheDocument()
    expect(screen.getByText('class-notes.txt')).toBeInTheDocument()
    expect(screen.getByText(/2 passages indexed/)).toBeInTheDocument()
  })

  it('shows the file name while it is being processed', async () => {
    let finish: (parsed: ParsedFile) => void = () => {}
    vi.mocked(parsePdf).mockReturnValue(new Promise((r) => (finish = r)))
    render(<App />)
    await userEvent.upload(input(), pdf())

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('week-2.pdf')
    expect(status).toHaveTextContent('Reading your document…')
    expect(input()).toBeDisabled()

    finish(parsedPdf)
    expect(await screen.findByText('✓ Ready to explore')).toBeInTheDocument()
    expect(screen.getByText(/PDF · 1 pages/)).toBeInTheDocument()
  })

  it('shows a clear, dismissable error when an unsupported file is dropped', async () => {
    render(<App />)
    // Drop bypasses the input's `accept` filter, as in a real drag-and-drop.
    const zone = input().closest('label')
    expect(zone).not.toBeNull()
    fireEvent.drop(zone!, {
      dataTransfer: { files: [new File(['x'], 'slides.pptx')] },
    })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('slides.pptx')
    expect(alert).toHaveTextContent('Can’t use this file')
    expect(alert).toHaveTextContent(/\.pptx files aren't supported yet/)
    // Retrying an unsupported file can't help, so only offer to dismiss.
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejects a renamed file by its contents, then recovers with a valid one', async () => {
    render(<App />)
    const fake = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0])],
      'a.docx',
    )
    await userEvent.upload(input(), fake)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Can’t use this file')
    expect(alert).toHaveTextContent(/contents don’t match/)

    // No refresh or dismiss needed: choosing another file replaces the error.
    await userEvent.upload(input(), new File(['notes'], 'notes.txt'))
    expect(await screen.findByText('✓ Ready to explore')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('lets the same file be chosen again after an error', async () => {
    render(<App />)
    const empty = new File([], 'empty.txt')
    await userEvent.upload(input(), empty)
    await userEvent.click(
      await screen.findByRole('button', { name: 'Dismiss' }),
    )

    await userEvent.upload(input(), empty)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That file is empty.',
    )
  })

  it('offers Try again when the reader fails to load, and succeeds on retry', async () => {
    vi.mocked(parsePdf)
      .mockRejectedValueOnce(
        new UploadError('reader-unavailable', 'We couldn’t load the reader.', {
          retryable: true,
        }),
      )
      .mockResolvedValueOnce(parsedPdf)
    render(<App />)
    await userEvent.upload(input(), pdf())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Couldn’t process')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('✓ Ready to explore')).toBeInTheDocument()
    expect(parsePdf).toHaveBeenCalledTimes(2)
  })

  it('reads a real .docx end to end', async () => {
    render(<App />)
    await userEvent.upload(input(), new File([DOCX_FIXTURE], 'ball.docx'))

    expect(await screen.findByText('✓ Ready to explore')).toBeInTheDocument()
    expect(
      screen.getByText(/DOCX · 1 KB · 2 passages indexed/),
    ).toBeInTheDocument()
  })

  it('does not offer Try again for a damaged file', async () => {
    render(<App />)
    // Valid ZIP signature, so it passes the content check but fails parsing.
    const corrupt = new File([DOCX_FIXTURE.subarray(0, 200)], 'broken.docx')
    await userEvent.upload(input(), corrupt)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Couldn’t process')
    expect(alert).toHaveTextContent(/may be damaged or password-protected/)
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('reports an empty file', async () => {
    render(<App />)
    await userEvent.upload(input(), new File([], 'empty.txt'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That file is empty.',
    )
  })

  it('lets the user dismiss the upload status without losing the document', async () => {
    render(<App />)
    await userEvent.upload(input(), new File(['hi'], 'a.txt'))
    await userEvent.click(
      await screen.findByRole('button', { name: 'Dismiss' }),
    )

    expect(screen.queryByText('✓ Ready to explore')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Ask about your documents' }),
    ).toBeInTheDocument()
  })
})

describe('asking about a document', () => {
  const notes = () =>
    new File(
      [
        'Mitochondria produce ATP through cellular respiration.\n\nRibosomes assemble proteins.',
      ],
      'biology.txt',
      { type: 'text/plain' },
    )

  /** Replies to /api/chat with `reply`, recording each request body sent. */
  function serveChat(reply: (request: ChatRequest) => ChatReply) {
    const requests: ChatRequest[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as ChatRequest
      requests.push(request)
      return Response.json(reply(request))
    })
    return requests
  }

  const citeFirst = (request: ChatRequest): ChatReply => ({
    answer: 'They produce ATP.',
    answerable: true,
    citations: request.passages.slice(0, 1),
  })

  const ask = async (question: string) => {
    await userEvent.type(
      await screen.findByLabelText('Ask a question about your documents'),
      `${question}{Enter}`,
    )
  }

  afterEach(() => vi.restoreAllMocks())

  it('answers from the uploaded document and shows where the answer came from', async () => {
    const requests = serveChat(citeFirst)
    render(<App />)
    await userEvent.upload(input(), notes())

    await ask('What do mitochondria produce?')

    expect(await screen.findByText('They produce ATP.')).toBeInTheDocument()
    expect(screen.getByText('biology.txt · Line 1')).toBeInTheDocument()
    // Retrieval ran in the browser: only the relevant passage was sent.
    expect(requests[0]?.passages.map((p) => p.text)).toEqual([
      'Mitochondria produce ATP through cellular respiration.',
    ])
  })

  it('sends no passages when the document does not cover the question', async () => {
    const requests = serveChat(() => ({
      answer: 'Your documents don’t seem to cover this.',
      answerable: false,
      citations: [],
    }))
    render(<App />)
    await userEvent.upload(input(), notes())

    await ask('Who won the 1998 World Cup?')

    expect(
      await screen.findByText('Not answered from your documents'),
    ).toBeInTheDocument()
    expect(requests[0]?.passages).toEqual([])
  })

  it('restores the conversation when the app is opened again', async () => {
    serveChat(citeFirst)
    const { unmount } = render(<App />)
    await userEvent.upload(input(), notes())
    await ask('What do mitochondria produce?')
    await screen.findByText('They produce ATP.')

    unmount()
    render(<App />)

    expect(await screen.findByText('They produce ATP.')).toBeInTheDocument()
    expect(
      screen.getByText('What do mitochondria produce?'),
    ).toBeInTheDocument()
    expect(screen.getByText('biology.txt · Line 1')).toBeInTheDocument()
  })

  it('sends earlier turns as history with a follow-up question', async () => {
    const requests = serveChat(citeFirst)
    render(<App />)
    await userEvent.upload(input(), notes())
    await ask('What do mitochondria produce?')
    await screen.findByText('They produce ATP.')

    await ask('How is ATP made by mitochondria?')

    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1]?.history).toEqual([
      { role: 'user', content: 'What do mitochondria produce?' },
      { role: 'assistant', content: 'They produce ATP.' },
    ])
  })

  it('switches conversations when another document is chosen', async () => {
    serveChat(citeFirst)
    render(<App />)
    await userEvent.upload(input(), notes())
    await ask('What do mitochondria produce?')
    await screen.findByText('They produce ATP.')

    await userEvent.upload(
      input(),
      new File(['Photosynthesis happens in chloroplasts.'], 'plants.txt'),
    )
    const plants = await screen.findByRole('button', { name: 'plants.txt' })
    expect(plants).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('They produce ATP.')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'biology.txt' }))
    expect(await screen.findByText('They produce ATP.')).toBeInTheDocument()
  })

  it('reports a document that was read but could not be saved', async () => {
    const failing: StorageAdapter = {
      ...createMemoryAdapter(),
      put: () => Promise.reject(new Error('QuotaExceededError')),
    }
    setStorageAdapter(failing)
    render(<App />)

    await userEvent.upload(input(), notes())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'couldn’t save it on this device',
    )
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
  })
})
