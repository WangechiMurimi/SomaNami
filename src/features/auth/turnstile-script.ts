/** Options we pass to `turnstile.render` (Cloudflare's names). */
export interface TurnstileOptions {
  sitekey: string
  callback?: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: (code: string) => void
  theme?: 'auto' | 'light' | 'dark'
  size?: 'normal' | 'flexible' | 'compact'
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileOptions): string | undefined
  reset(widgetId: string): void
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

// Cloudflare asks that this exact URL is loaded, never proxied or cached.
export const TURNSTILE_SCRIPT =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let loading: Promise<TurnstileApi> | null = null

/** Loads Cloudflare's Turnstile script once per page and resolves with its API. */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT
    script.async = true
    script.dataset.turnstile = ''
    script.addEventListener('load', () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error('Turnstile did not start')),
    )
    script.addEventListener('error', () => {
      // Let a later form try again, e.g. after reconnecting.
      loading = null
      script.remove()
      reject(new Error('Turnstile failed to load'))
    })
    document.head.append(script)
  })
  return loading
}

/** Test helper: forgets the cached script load. */
export function resetTurnstileLoader(): void {
  loading = null
}
