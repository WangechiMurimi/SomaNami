import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Turnstile from './Turnstile.tsx'
import { resetTurnstileLoader, TURNSTILE_SCRIPT } from './turnstile-script.ts'
import type { TurnstileOptions } from './turnstile-script.ts'

function fakeTurnstile() {
  const widgets: TurnstileOptions[] = []
  const api = {
    render: vi.fn((_el: HTMLElement, options: TurnstileOptions) => {
      widgets.push(options)
      return `widget-${widgets.length}`
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  }
  window.turnstile = api
  return { api, widgets }
}

beforeEach(() => {
  resetTurnstileLoader()
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key')
})
afterEach(() => {
  delete window.turnstile
  vi.unstubAllEnvs()
  document.head
    .querySelectorAll('script[data-turnstile]')
    .forEach((el) => el.remove())
})

describe('Turnstile', () => {
  it('loads the script once, explicitly rendered', () => {
    render(<Turnstile onToken={() => {}} resetKey={0} />)
    render(<Turnstile onToken={() => {}} resetKey={0} />)
    const scripts = document.head.querySelectorAll('script[data-turnstile]')
    expect(scripts).toHaveLength(1)
    expect(scripts[0]).toHaveAttribute('src', TURNSTILE_SCRIPT)
    expect(TURNSTILE_SCRIPT).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    )
  })

  it('renders with the site key and returns the token', async () => {
    const { api, widgets } = fakeTurnstile()
    const onToken = vi.fn()
    render(<Turnstile onToken={onToken} resetKey={0} />)

    await vi.waitFor(() => expect(api.render).toHaveBeenCalledOnce())
    expect(widgets[0]?.sitekey).toBe('site-key')
    act(() => widgets[0]?.callback?.('token-1'))
    expect(onToken).toHaveBeenLastCalledWith('token-1')
  })

  it('clears the token when it expires or errors', async () => {
    const { api, widgets } = fakeTurnstile()
    const onToken = vi.fn()
    render(<Turnstile onToken={onToken} resetKey={0} />)
    await vi.waitFor(() => expect(api.render).toHaveBeenCalled())

    act(() => widgets[0]?.['expired-callback']?.())
    expect(onToken).toHaveBeenLastCalledWith(null)
    act(() => widgets[0]?.['error-callback']?.('300010'))
    expect(onToken).toHaveBeenLastCalledWith(null)
  })

  it('resets the widget when resetKey changes, and removes it on unmount', async () => {
    const { api } = fakeTurnstile()
    const onToken = vi.fn()
    const { rerender, unmount } = render(
      <Turnstile onToken={onToken} resetKey={0} />,
    )
    await vi.waitFor(() => expect(api.render).toHaveBeenCalled())

    rerender(<Turnstile onToken={onToken} resetKey={1} />)
    expect(api.reset).toHaveBeenCalledWith('widget-1')
    expect(onToken).toHaveBeenLastCalledWith(null)

    unmount()
    expect(api.remove).toHaveBeenCalledWith('widget-1')
  })

  it('reports an empty token when no site key is configured', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')
    const onToken = vi.fn()
    render(<Turnstile onToken={onToken} resetKey={0} />)
    expect(onToken).toHaveBeenCalledWith('')
    expect(document.head.querySelector('script[data-turnstile]')).toBeNull()
  })
})
