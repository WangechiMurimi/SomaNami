import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { StoredDocument } from '../../types/contracts.ts'
import AttachmentChips from './AttachmentChips.tsx'
import type { Attachment } from './use-attachments.ts'

const document: StoredDocument = {
  id: 'cells',
  name: 'cells.pdf',
  size: 1,
  kind: 'pdf',
  pageCount: 1,
  chunks: [],
  workspaceId: 'default',
  createdAt: 1,
  updatedAt: 1,
}

function setup(attachments: Attachment[]) {
  const onRetry = vi.fn()
  const onRemove = vi.fn()
  render(
    <AttachmentChips
      attachments={attachments}
      onRetry={onRetry}
      onRemove={onRemove}
    />,
  )
  return { onRetry, onRemove }
}

describe('AttachmentChips', () => {
  it('renders nothing with no files attached', () => {
    setup([])
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows a ghost while a file is being added', () => {
    setup([{ key: 'a', fileName: 'cells.pdf', status: 'processing' }])

    const ghost = screen.getByTestId('attachment-ghost')
    expect(ghost).toHaveRole('status')
    expect(ghost).toHaveTextContent('Adding cells.pdf')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('replaces the ghost with the file, its type icon and a remove button', async () => {
    const ready: Attachment = {
      key: 'a',
      fileName: 'cells.pdf',
      status: 'ready',
      document,
    }
    const { onRemove } = setup([ready])

    expect(screen.queryByTestId('attachment-ghost')).not.toBeInTheDocument()
    const item = screen.getByRole('listitem')
    expect(item).toHaveTextContent('cells.pdf')
    expect(item.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove cells.pdf' }),
    )
    expect(onRemove).toHaveBeenCalledWith(ready)
  })

  it('shows a failure on its chip and retries it', async () => {
    const { onRetry } = setup([
      {
        key: 'a',
        fileName: 'cells.pdf',
        status: 'error',
        error: {
          code: 'parse-failed',
          message: 'We couldn’t read that file.',
          stage: 'processing',
          retryable: true,
        },
      },
    ])

    expect(screen.getByRole('alert')).toHaveTextContent(
      'We couldn’t read that file.',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Try again with cells.pdf' }),
    )
    expect(onRetry).toHaveBeenCalledWith('a')
  })

  it('offers no retry when retrying cannot help', () => {
    setup([
      {
        key: 'a',
        fileName: 'empty.txt',
        status: 'error',
        error: {
          code: 'empty',
          message: 'That file is empty.',
          stage: 'validation',
          retryable: false,
        },
      },
    ])

    expect(
      screen.queryByRole('button', { name: /Try again/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remove empty.txt' }),
    ).toBeInTheDocument()
  })
})
