import { readFileSync } from 'node:fs'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import {
  createConversation,
  createMemoryAdapter,
  saveDocument,
  setStorageAdapter,
} from './lib/storage/index.ts'
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
beforeEach(() => {
  setStorageAdapter(createMemoryAdapter())
  // BrowserRouter reads the real URL, which jsdom keeps between tests.
  window.history.pushState({}, '', '/')
})

const uploadRegion = () =>
  within(screen.getByRole('region', { name: 'Upload' }))

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

    const status = await uploadRegion().findByRole('status')
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
    expect(screen.getByRole('link', { name: /My library/ })).toHaveTextContent(
      '1',
    )
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

  /** Uploads a file, then follows "Ask about this" into its chat. */
  const uploadAndOpen = async (file: File) => {
    await userEvent.upload(input(), file)
    await userEvent.click(
      await screen.findByRole('link', { name: 'Ask about this' }),
    )
  }

  it('answers from the uploaded document and shows where the answer came from', async () => {
    const requests = serveChat(citeFirst)
    render(<App />)
    await uploadAndOpen(notes())

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
    await uploadAndOpen(notes())

    await ask('Who won the 1998 World Cup?')

    expect(
      await screen.findByText('Not answered from your documents'),
    ).toBeInTheDocument()
    expect(requests[0]?.passages).toEqual([])
  })

  it('restores the conversation when the app is opened again', async () => {
    serveChat(citeFirst)
    const { unmount } = render(<App />)
    await uploadAndOpen(notes())
    await ask('What do mitochondria produce?')
    await screen.findByText('They produce ATP.')

    unmount()
    render(<App />)

    expect(await screen.findByText('They produce ATP.')).toBeInTheDocument()
    expect(
      within(screen.getByRole('main')).getByText(
        'What do mitochondria produce?',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('biology.txt · Line 1')).toBeInTheDocument()
  })

  it('sends earlier turns as history with a follow-up question', async () => {
    const requests = serveChat(citeFirst)
    render(<App />)
    await uploadAndOpen(notes())
    await ask('What do mitochondria produce?')
    await screen.findByText('They produce ATP.')

    await ask('How is ATP made by mitochondria?')

    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1]?.history).toEqual([
      { role: 'user', content: 'What do mitochondria produce?' },
      { role: 'assistant', content: 'They produce ATP.' },
    ])
  })

  it('keeps each material’s conversation separate', async () => {
    serveChat(citeFirst)
    render(<App />)
    await uploadAndOpen(notes())
    await ask('What do mitochondria produce?')
    await screen.findByText('They produce ATP.')

    await userEvent.click(screen.getByRole('link', { name: 'Home' }))
    await uploadAndOpen(
      new File(['Photosynthesis happens in chloroplasts.'], 'plants.txt'),
    )
    expect(
      await screen.findByRole('heading', { name: 'plants.txt' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('They produce ATP.')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: /My library/ }))
    await userEvent.click(
      await screen.findByRole('link', { name: 'Ask about this: biology.txt' }),
    )
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

describe('app shell and navigation', () => {
  it('marks the current screen in the sidebar', async () => {
    render(<App />)

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await userEvent.click(screen.getByRole('link', { name: /My library/ }))
    expect(
      screen.getByRole('heading', { level: 1, name: 'My library' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /My library/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('lists stored materials in the library table', async () => {
    render(<App />)
    await userEvent.upload(input(), new File(['one\n\ntwo'], 'notes.txt'))
    await screen.findByText('✓ Ready to explore')

    await userEvent.click(screen.getByRole('link', { name: /My library/ }))

    const table = await screen.findByRole('table', { name: 'Your materials' })
    const row = within(table).getByRole('row', { name: /notes\.txt/ })
    expect(row).toHaveTextContent('Text')
    expect(row).toHaveTextContent('2')
  })

  it('explains an empty library', async () => {
    window.history.pushState({}, '', '/library')
    render(<App />)

    expect(
      await screen.findByText(
        'Nothing here yet. Upload a document above to start.',
      ),
    ).toBeInTheDocument()
  })

  it('explains a chat link to a material that is not on this device', async () => {
    window.history.pushState({}, '', '/chat/missing')
    render(<App />)

    expect(
      await screen.findByRole('heading', {
        name: 'We can’t find that material',
      }),
    ).toBeInTheDocument()
  })

  it('shows a not-found page for unknown addresses', () => {
    window.history.pushState({}, '', '/nowhere')
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
  })

  it('opens and closes the menu on small screens', async () => {
    render(<App />)
    const open = screen.getByRole('button', { name: 'Open menu' })

    await userEvent.click(open)
    expect(open).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(open).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows whether the device is online', () => {
    render(<App />)

    expect(
      screen.getByRole('region', { name: 'On this device' }),
    ).toHaveTextContent('Online')
  })

  it('links to every screen from the sidebar', () => {
    render(<App />)
    const nav = within(screen.getByRole('navigation', { name: 'Main' }))

    for (const name of [
      'Home',
      'Workspaces',
      /My library/,
      'Saved conversations',
    ]) {
      expect(nav.getByRole('link', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'New workspace' })).toHaveAttribute(
      'href',
      '/workspaces/new',
    )
  })

  it('says where recent chats will appear before there are any', async () => {
    render(<App />)

    expect(
      await screen.findByText('Chats you start will appear here.'),
    ).toBeInTheDocument()
  })

  it('lists recent chats, newest first, and opens one', async () => {
    await saveDocument({
      id: 'doc-1',
      name: 'Cells.txt',
      size: 10,
      kind: 'text',
      pageCount: null,
      chunks: [],
    })
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1000)
    await createConversation({ documentId: 'doc-1', title: 'What is a cell?' })
    now.mockReturnValue(2000)
    await createConversation({ documentId: 'doc-1', title: 'Why mitosis?' })
    now.mockRestore()
    render(<App />)

    const recent = within(screen.getByRole('region', { name: 'Recent chats' }))
    const links = await recent.findAllByRole('link', { name: /\?$/ })
    expect(links.map((link) => link.textContent)).toEqual([
      'Why mitosis?',
      'What is a cell?',
    ])

    await userEvent.click(links[0]!)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cells.txt' }),
    ).toBeInTheDocument()
  })

  it('lists saved conversations with their material', async () => {
    await createConversation({ documentId: 'gone', title: 'Old question' })
    window.history.pushState({}, '', '/conversations')
    render(<App />)

    const item = await within(screen.getByRole('main')).findByRole('link', {
      name: /Old question/,
    })
    expect(item).toHaveTextContent('Material not found')
  })

  it('opens the help page from the top bar', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('link', { name: 'Help' }))
    expect(
      screen.getByRole('heading', { level: 1, name: 'How SomaNami works' }),
    ).toBeInTheDocument()
  })
})
