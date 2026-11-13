import { readFileSync } from 'node:fs'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HomeCube from './HomeCube.tsx'
import HowItWorks from './HowItWorks.tsx'

describe('HowItWorks', () => {
  it('lists the four steps in order', () => {
    render(<HowItWorks uploadTo="#upload" />)

    const steps = within(
      screen.getByRole('list', { name: 'How it works' }),
    ).getAllByRole('heading', { level: 2 })
    expect(steps.map((step) => step.textContent)).toEqual([
      'Add your materials',
      'Talk it through',
      'Find your explanation',
      'See another perspective',
    ])
  })

  it('points the upload link where the caller says', () => {
    render(<HowItWorks uploadTo="#upload" />)

    expect(
      screen.getByRole('link', { name: 'Upload materials' }),
    ).toHaveAttribute('href', '#upload')
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
