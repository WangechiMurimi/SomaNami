import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BreadcrumbContext, useBreadcrumbs, type Crumb } from './breadcrumbs.ts'

const TRAIL: Crumb[] = [
  { label: 'Workspaces', to: '/workspaces' },
  { label: 'Biology' },
]

function Page() {
  // A fresh array every render, as pages naturally write it.
  useBreadcrumbs([...TRAIL])
  return null
}

describe('useBreadcrumbs', () => {
  it('sets the trail once, then clears it when the page unmounts', () => {
    const setCrumbs = vi.fn()
    const { rerender, unmount } = render(
      <BreadcrumbContext value={setCrumbs}>
        <Page />
      </BreadcrumbContext>,
    )
    rerender(
      <BreadcrumbContext value={setCrumbs}>
        <Page />
      </BreadcrumbContext>,
    )

    expect(setCrumbs).toHaveBeenCalledTimes(1)
    expect(setCrumbs).toHaveBeenLastCalledWith(TRAIL)

    unmount()
    expect(setCrumbs).toHaveBeenLastCalledWith([])
  })

  it('does nothing outside the shell', () => {
    expect(() => render(<Page />)).not.toThrow()
  })
})
