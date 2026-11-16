import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import DataHandlingPage from './DataHandlingPage.tsx'

function renderPage() {
  render(
    <MemoryRouter>
      <DataHandlingPage />
    </MemoryRouter>,
  )
  return screen.getByRole('main')
}

describe('How your data is handled', () => {
  it('covers what is kept, storage, answers and removal', () => {
    renderPage()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'How your data is handled',
      }),
    ).toBeInTheDocument()
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'What we keep',
      'Where it’s stored',
      'How answers are made',
      'Removing your data',
    ])
  })

  it('states what the code does and flags what the owner must confirm', () => {
    const main = renderPage()
    expect(main).toHaveTextContent(/saved to your SomaNami account/)
    expect(main).toHaveTextContent(
      /The server picks the best-matching passages/,
    )
    expect(main).toHaveTextContent(/“Erase my materials”/)
    expect(main.textContent?.match(/\[CONFIRM:/g)?.length).toBeGreaterThan(3)
  })

  it('names no model provider and makes no device or offline promises', () => {
    const main = renderPage()
    expect(main).not.toHaveTextContent(
      /anthropic|claude|offline|on this device|never leaves|stays? private/i,
    )
  })
})
