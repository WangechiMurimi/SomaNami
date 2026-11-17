import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ErrorAlert from './ErrorAlert.tsx'

describe('ErrorAlert', () => {
  it('announces its message as an alert', () => {
    render(<ErrorAlert>We couldn’t start this chat. Try again.</ErrorAlert>)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'We couldn’t start this chat. Try again.',
    )
  })

  it('keeps the warning tint whatever shape the page asks for', () => {
    render(<ErrorAlert className="rounded-xl p-6">Nope</ErrorAlert>)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('rounded-xl', 'p-6', 'bg-warn-soft', 'text-warn')
    expect(alert).not.toHaveClass('rounded-[10px]')
  })
})
