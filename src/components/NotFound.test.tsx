import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import NotFound from './NotFound.tsx'

describe('NotFound', () => {
  it('names what is missing and links back', () => {
    render(
      <MemoryRouter>
        <NotFound
          title="We can’t find that chat"
          note="It may have been removed."
          linkTo="/conversations"
          linkLabel="See your saved conversations"
        />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'We can’t find that chat',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/It may have been removed\./)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'See your saved conversations' }),
    ).toHaveAttribute('href', '/conversations')
  })

  it('shows only the link when there is no note', () => {
    render(
      <MemoryRouter>
        <NotFound title="Page not found" linkTo="/" linkLabel="Go home" />
      </MemoryRouter>,
    )

    const link = screen.getByRole('link', { name: 'Go home' })
    expect(link.parentElement).toHaveTextContent(/^Go home$/)
  })
})
