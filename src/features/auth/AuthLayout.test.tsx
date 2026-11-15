import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import AuthLayout from './AuthLayout.tsx'

const renderLayout = (wide = false) =>
  render(
    <MemoryRouter>
      <AuthLayout title="Welcome back" lede="Sign in to go on." wide={wide}>
        <p>Form goes here</p>
      </AuthLayout>
    </MemoryRouter>,
  )

describe('AuthLayout', () => {
  it('puts the screen title in the only h1, beside the brand panel', () => {
    renderLayout()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Welcome back' }),
    ).toBeInTheDocument()
    const panel = screen.getByRole('region', { name: 'About SomaNami' })
    expect(within(panel).getAllByRole('listitem')).toHaveLength(3)
    expect(panel).toHaveTextContent('Learn from your own materials.')
  })

  it('keeps privacy copy to what holds true', () => {
    renderLayout()
    const panel = screen.getByRole('region', { name: 'About SomaNami' })
    expect(panel).toHaveTextContent(/you can delete them at any time/i)
    expect(panel).not.toHaveTextContent(/stay private/i)
  })

  it('places the form before the brand copy for keyboard and phone users', () => {
    renderLayout()
    const main = screen.getByRole('main')
    const panel = screen.getByRole('region', { name: 'About SomaNami' })
    expect(
      main.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('has no theme toggle: signed-out visitors follow the system theme', () => {
    renderLayout()
    expect(
      screen.queryByRole('button', { name: /theme/i }),
    ).not.toBeInTheDocument()
  })

  it('drops the brand panel for wide reading pages', () => {
    renderLayout(true)
    expect(
      screen.queryByRole('region', { name: 'About SomaNami' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'SomaNami' })).toHaveAttribute(
      'href',
      '/',
    )
  })
})
