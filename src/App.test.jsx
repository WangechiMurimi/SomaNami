import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App.jsx'

const input = () => screen.getByLabelText('Upload a document')

describe('document upload', () => {
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

  it('shows a clear, dismissable error when an unsupported file is dropped', async () => {
    render(<App />)
    // Drop bypasses the input's `accept` filter, as in a real drag-and-drop.
    fireEvent.drop(input().closest('label'), {
      dataTransfer: { files: [new File(['x'], 'slides.pptx')] },
    })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Couldn’t process')
    expect(alert).toHaveTextContent(/\.pptx files aren't supported yet/)

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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
