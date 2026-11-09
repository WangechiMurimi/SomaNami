import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import DocumentCard from './DocumentCard.jsx'

const readyDocument = {
  id: 'd1',
  name: 'class-notes.pdf',
  size: 2048,
  kind: 'pdf',
  pageCount: 3,
  chunks: [{ id: 0 }, { id: 1 }],
}

const error = (overrides) => ({
  code: 'too-large',
  message: 'That file is over the 20 MB limit.',
  stage: 'validation',
  retryable: false,
  ...overrides,
})

describe('DocumentCard', () => {
  it('renders nothing while idle', () => {
    const { container } = render(<DocumentCard status="idle" document={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('confirms a successful upload with its format, pages and passage count', () => {
    render(<DocumentCard status="ready" document={readyDocument} />)

    const card = screen.getByRole('status')
    expect(card).toHaveTextContent('class-notes.pdf')
    expect(card).toHaveTextContent('✓ Ready to explore')
    expect(card).toHaveTextContent('PDF · 3 pages · 2 KB · 2 passages indexed')
  })

  it('announces progress politely but failures assertively', () => {
    const { rerender } = render(
      <DocumentCard status="processing" document={null} fileName="a.pdf" />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Reading your document…',
    )

    rerender(
      <DocumentCard
        status="error"
        document={null}
        error={error()}
        fileName="a.pdf"
      />,
    )
    // An error interrupts the user, so it is an alert rather than a status.
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('shows an oversized file as unusable, with a dismiss and no pointless retry', async () => {
    const onClear = vi.fn()
    render(
      <DocumentCard
        status="error"
        document={null}
        error={error()}
        fileName="thesis.pdf"
        onClear={onClear}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('thesis.pdf')
    expect(alert).toHaveTextContent('Can’t use this file')
    expect(alert).toHaveTextContent('That file is over the 20 MB limit.')
    // Re-reading the same oversized file cannot succeed.
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onClear).toHaveBeenCalled()
  })

  it('separates "we failed" from "this file is unusable" and offers a retry', async () => {
    const onRetry = vi.fn()
    render(
      <DocumentCard
        status="error"
        document={null}
        error={error({
          code: 'reader-unavailable',
          message: 'We couldn’t load the document reader.',
          stage: 'processing',
          retryable: true,
        })}
        fileName="a.pdf"
        onRetry={onRetry}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t process')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('offers no actions while processing, so a half-read document cannot be cleared mid-flight', () => {
    render(
      <DocumentCard status="processing" document={null} fileName="a.pdf" />,
    )
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
