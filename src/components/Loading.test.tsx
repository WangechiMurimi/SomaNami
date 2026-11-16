import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Loading from './Loading.tsx'

describe('Loading', () => {
  it('announces its message as a status', () => {
    render(<Loading>Opening your library…</Loading>)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Opening your library…',
    )
  })
})
