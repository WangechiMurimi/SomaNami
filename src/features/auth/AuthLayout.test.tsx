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

  it('states where answers come from, without privacy or offline claims', () => {
    renderLayout()
    const panel = screen.getByRole('region', { name: 'About SomaNami' })
    expect(panel).toHaveTextContent(/answers come only from what you add/i)
    expect(panel).not.toHaveTextContent(/private|offline|this device/i)
    expect(
      within(panel).getByRole('link', { name: 'How your data is handled' }),
    ).toHaveAttribute('href', '/your-data')
  })

  it('shows a step line above the title when given one', () => {
    render(
      <MemoryRouter>
        <AuthLayout title="Create your account" eyebrow="Step 1 of 2">
          <p>Form goes here</p>
        </AuthLayout>
      </MemoryRouter>,
    )
    const step = screen.getByText('Step 1 of 2')
    expect(
      step.compareDocumentPosition(screen.getByRole('heading', { level: 1 })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
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
