import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { vi } from 'vitest'
import AuthProvider from '../AuthProvider.tsx'
import type { TurnstileApi, TurnstileOptions } from '../turnstile-script.ts'

// Test-only helper: fast refresh never loads this file.
// eslint-disable-next-line react-refresh/only-export-components
function LocationProbe() {
  const { pathname, search } = useLocation()
  return <p data-testid="location">{pathname + search}</p>
}

/**
 * Renders `routes` at `path` inside a real AuthProvider. Any route they don't
 * handle shows the current location, so tests can assert where a redirect went.
 */
export function renderAt(path: string, routes: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          {routes}
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

/** The location shown after a redirect away from the page under test. */
export const redirectedTo = async () =>
  (await screen.findByTestId('location')).textContent

/**
 * Configures a site key and a fake Turnstile that hands out `captcha-1`,
 * `captcha-2`… on render and on each reset, like a passing real widget.
 */
export function installFakeTurnstile(): TurnstileApi {
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key')
  let issued = 0
  const widgets: TurnstileOptions[] = []
  const issue = (options: TurnstileOptions | undefined) =>
    options?.callback?.(`captcha-${++issued}`)
  const api: TurnstileApi = {
    render: vi.fn((_el: HTMLElement, options: TurnstileOptions) => {
      widgets.push(options)
      issue(options)
      return `widget-${widgets.length}`
    }),
    reset: vi.fn((id: string) => issue(widgets[Number(id.split('-')[1]) - 1])),
    remove: vi.fn(),
  }
  window.turnstile = api
  return api
}
