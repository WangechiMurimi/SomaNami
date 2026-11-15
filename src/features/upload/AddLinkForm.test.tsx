import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AddLinkForm from './AddLinkForm.tsx'

const setOnline = (online: boolean) =>
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)

afterEach(() => {
  vi.restoreAllMocks()
})

const setup = () => {
  const onLink = vi.fn()
  const onCancel = vi.fn()
  render(<AddLinkForm onLink={onLink} onCancel={onCancel} />)
  return { onLink, onCancel }
}

describe('AddLinkForm', () => {
  it('submits a normalised link and clears the field', async () => {
    const { onLink } = setup()
    const input = screen.getByLabelText('Link')
    await userEvent.type(input, 'example.org/article')
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }))
    expect(onLink).toHaveBeenCalledWith('https://example.org/article')
    expect(input).toHaveValue('')
  })

  it('asks for a link when empty, and explains a bad one', async () => {
    const { onLink } = setup()
    const input = screen.getByLabelText('Link')

    await userEvent.click(screen.getByRole('button', { name: 'Add link' }))
    expect(input).toHaveAccessibleDescription(/Paste a link to add\./)

    await userEvent.type(input, 'not a link')
    expect(input).not.toHaveAttribute('aria-invalid')
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }))
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/Enter a web address/)
    expect(onLink).not.toHaveBeenCalled()
  })

  it('says what kinds of links work', () => {
    setup()
    expect(screen.getByLabelText('Link')).toHaveAccessibleDescription(
      /web article, PDF or Word document\. Videos aren’t supported yet\./,
    )
  })

  it('needs a connection', () => {
    setOnline(false)
    setup()
    expect(screen.getByRole('button', { name: 'Add link' })).toBeDisabled()
    expect(screen.getByLabelText('Link')).toHaveAccessibleDescription(
      /needs an internet connection/,
    )
  })

  it('cancels', async () => {
    const { onCancel } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
