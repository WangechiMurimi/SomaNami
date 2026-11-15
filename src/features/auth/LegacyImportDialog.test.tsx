import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import LegacyImportDialog from './LegacyImportDialog.tsx'

const setup = (onMove = vi.fn(() => Promise.resolve())) => {
  const onLeave = vi.fn()
  const onLater = vi.fn()
  render(
    <LegacyImportDialog onMove={onMove} onLeave={onLeave} onLater={onLater} />,
  )
  return { onMove, onLeave, onLater }
}

const move = () => screen.getByRole('button', { name: 'Move them' })
const leave = () => screen.getByRole('button', { name: 'Leave them aside' })

describe('LegacyImportDialog', () => {
  it('is a labelled, described modal dialog', () => {
    setup()
    const dialog = screen.getByRole('dialog', {
      name: 'Move the materials already on this device into your account?',
    })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription(/stay on this device/i)
  })

  it('starts with focus on the first choice', () => {
    setup()
    expect(move()).toHaveFocus()
  })

  it('keeps focus inside the dialog', async () => {
    setup()
    await userEvent.tab()
    expect(leave()).toHaveFocus()
    await userEvent.tab()
    expect(move()).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(leave()).toHaveFocus()
  })

  it('treats Esc as “not now”, never as either choice', async () => {
    const { onMove, onLeave, onLater } = setup()
    await userEvent.keyboard('{Escape}')
    expect(onLater).toHaveBeenCalledOnce()
    expect(onMove).not.toHaveBeenCalled()
    expect(onLeave).not.toHaveBeenCalled()
  })

  it('leaves them aside', async () => {
    const { onLeave } = setup()
    await userEvent.click(leave())
    expect(onLeave).toHaveBeenCalledOnce()
  })

  it('shows progress and blocks a second choice while moving', async () => {
    let finish = () => {}
    const onMove = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    )
    const { onLater } = setup(onMove)
    await userEvent.click(move())

    expect(screen.getByRole('button', { name: 'Moving…' })).toBeDisabled()
    expect(leave()).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(onLater).not.toHaveBeenCalled()
    finish()
  })

  it('reports a failed move, says the materials are safe, and allows a retry', async () => {
    const onMove = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('QuotaExceededError'))
      .mockResolvedValueOnce()
    setup(onMove)
    await userEvent.click(move())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn’t move them.*still on this device/i,
    )
    expect(move()).toBeEnabled()
    await userEvent.click(move())
    expect(onMove).toHaveBeenCalledTimes(2)
  })
})
