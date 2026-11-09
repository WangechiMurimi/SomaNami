import { readFileSync } from 'node:fs'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { parsePdf } from './features/upload/parse-pdf.js'
import { UploadError } from './features/upload/upload-error.js'

// pdf.js can't run in jsdom; the PDF parser has its own unit tests.
vi.mock('./features/upload/parse-pdf.js', () => ({ parsePdf: vi.fn() }))

// A minimal real Word document, so the DOCX path runs through actual mammoth.
// Resolved from the Vitest root: jsdom replaces `import.meta.url` with an http URL.
const DOCX_FIXTURE = readFileSync(
  'src/features/upload/fixtures/bouncing-ball.docx',
)

const input = () => screen.getByLabelText('Upload a document')
const pdf = (name = 'week-2.pdf') => new File(['%PDF-1.7\n'], name)
const parsedPdf = {
  chunks: [{ text: 'Squash and stretch', source: { type: 'page', page: 1 } }],
  pageCount: 1,
}

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
    let finish
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
    fireEvent.drop(input().closest('label'), {
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

  it('lets the user remove a processed document', async () => {
    render(<App />)
    await userEvent.upload(input(), new File(['hi'], 'a.txt'))
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
