import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import UploadZone from './UploadZone.tsx'

const input = () => screen.getByLabelText('Upload a document')
const zone = (): HTMLLabelElement => {
  const label = input().closest('label')
  if (!label)
    throw new Error('UploadZone should render its input inside a <label>')
  return label
}

const drop = (files: File[]) =>
  fireEvent.drop(zone(), {
    dataTransfer: { files, items: [], types: ['Files'] },
  })

describe('UploadZone', () => {
  it('reports a dropped file, so drag-and-drop is a real route in, not only the picker', () => {
    const onFile = vi.fn()
    render(<UploadZone onFile={onFile} />)
    const file = new File(['notes'], 'dropped.txt')

    drop([file])

    expect(onFile).toHaveBeenCalledWith(file)
  })

  it('reports a file chosen through the picker', async () => {
    const onFile = vi.fn()
    render(<UploadZone onFile={onFile} />)
    const file = new File(['notes'], 'picked.txt')

    await userEvent.upload(input(), file)

    expect(onFile).toHaveBeenCalledWith(file)
  })

  it('ignores a drop while a document is already being read', () => {
    const onFile = vi.fn()
    render(<UploadZone onFile={onFile} disabled />)

    drop([new File(['notes'], 'second.txt')])

    expect(onFile).not.toHaveBeenCalled()
    expect(input()).toBeDisabled()
  })

  it('highlights the zone while a file is dragged over it', () => {
    render(<UploadZone onFile={vi.fn()} />)

    fireEvent.dragEnter(zone(), { dataTransfer: { types: ['Files'] } })
    expect(zone().className).toContain('bg-surface')

    fireEvent.dragLeave(zone())
    expect(zone().className).toContain('bg-jac-soft')
  })

  it('is reachable and operable from the keyboard alone', async () => {
    const onFile = vi.fn()
    render(<UploadZone onFile={onFile} />)

    // The visible zone is a <label>, so tabbing lands on its file input and
    // the browser's own activation opens the picker: no mouse-only path.
    await userEvent.tab()
    expect(input()).toHaveFocus()
    expect(zone()).toContainElement(input())

    // Visually hidden, not hidden from assistive tech.
    expect(input()).not.toHaveAttribute('aria-hidden')
    expect(input()).toHaveAccessibleName('Upload a document')
  })

  it('hides the decorative icon and states the accepted formats and limit', () => {
    render(<UploadZone onFile={vi.fn()} />)

    expect(zone().querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(
      screen.getByText('PDF, DOCX, TXT or Markdown, up to 20 MB'),
    ).toBeInTheDocument()
    expect(input()).toHaveAttribute('accept', '.pdf,.docx,.txt,.md')
  })
})
