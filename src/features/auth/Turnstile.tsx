import { useEffect, useRef, useState } from 'react'
import { loadTurnstile } from './turnstile-script.ts'
import type { TurnstileApi } from './turnstile-script.ts'

interface TurnstileProps {
  /** A fresh token, or `null` when the last one expired or failed. */
  onToken: (token: string | null) => void
  /** Change it after each submit: a token is valid for one use only. */
  resetKey: number
}

const siteKey = () => import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? ''

// Match the app's chosen theme, not just the system's.
function widgetTheme(): 'auto' | 'light' | 'dark' {
  const theme = document.documentElement.dataset.theme
  return theme === 'light' || theme === 'dark' ? theme : 'auto'
}

/**
 * Cloudflare Turnstile bot check. Supabase verifies the token server-side
 * (captcha protection in the dashboard); without a site key, as in local
 * development, it reports an empty token and renders nothing.
 */
export default function Turnstile({ onToken, resetKey }: TurnstileProps) {
  const container = useRef<HTMLDivElement>(null)
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null)
  const [failed, setFailed] = useState(false)
  // The latest callback, so re-renders with a new function don't re-mount the widget.
  const onTokenRef = useRef(onToken)
  useEffect(() => {
    onTokenRef.current = onToken
  })

  const key = siteKey()

  useEffect(() => {
    if (!key) {
      onTokenRef.current('')
      return
    }
    let active = true
    loadTurnstile().then(
      (api) => {
        if (!active || !container.current) return
        const id = api.render(container.current, {
          sitekey: key,
          theme: widgetTheme(),
          size: 'flexible',
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        })
        if (id) widget.current = { api, id }
      },
      () => {
        if (active) setFailed(true)
      },
    )
    return () => {
      active = false
      if (widget.current) widget.current.api.remove(widget.current.id)
      widget.current = null
    }
  }, [key])

  // Skip the first run: a new widget has nothing to reset.
  const firstReset = useRef(resetKey)
  useEffect(() => {
    if (resetKey === firstReset.current) return
    firstReset.current = resetKey
    onTokenRef.current(null)
    if (widget.current) widget.current.api.reset(widget.current.id)
  }, [resetKey])

  if (!key) return null
  return (
    <div>
      <div ref={container} className="min-h-[65px]" />
      {failed && (
        <p role="alert" className="mt-2 text-[13px] text-warn">
          The security check couldn’t load. Check your connection and reload the
          page.
        </p>
      )}
    </div>
  )
}
