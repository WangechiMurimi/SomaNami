import { readFileSync } from 'node:fs'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import GroundingNote from './GroundingNote.tsx'
import HomeCube from './HomeCube.tsx'
import HowItWorks from './HowItWorks.tsx'

describe('HowItWorks', () => {
  it('lists the four directives in order', () => {
    render(<HowItWorks />)

    const steps = within(
      screen.getByRole('list', { name: 'How it works' }),
    ).getAllByRole('heading', { level: 2 })
    expect(steps.map((step) => step.textContent)).toEqual([
      'Add your materials',
      'Ask questions, explore ideas',
      'Make it make sense to you',
      'Explore it another way',
    ])
  })
})

describe('GroundingNote', () => {
  it('says answers trace back to the materials, with the chips hidden', () => {
    const { container } = render(<GroundingNote />)

    expect(screen.getByText(/stays grounded in your materials/)).toBeVisible()
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      'Your content',
    )
  })
})

describe('HomeCube', () => {
  it('draws 27 blocks and hides them from assistive technology', () => {
    render(<HomeCube />)

    const cube = screen.getByTestId('home-cube')
    expect(cube).toHaveAttribute('aria-hidden', 'true')
    expect(cube.querySelectorAll('.home-cube__block')).toHaveLength(27)
  })

  it('stops animating when the user prefers reduced motion', () => {
    // jsdom applies no stylesheets, so check the rule itself is present.
    const css = readFileSync('src/features/home/home-cube.css', 'utf8')
    const reduced = css.slice(css.indexOf('prefers-reduced-motion'))
    expect(reduced).toMatch(/\.home-cube__block::after\s*\{\s*animation: none/)
  })
})
