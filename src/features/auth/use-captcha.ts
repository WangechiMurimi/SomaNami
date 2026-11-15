import { useCallback, useState } from 'react'

/**
 * Token state for a form with a Turnstile check. Tokens are single-use, so
 * `renew()` after every submit asks the widget for a new one.
 */
export function useCaptcha() {
  const [token, setToken] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const renew = useCallback(() => setResetKey((n) => n + 1), [])
  return { token, resetKey, onToken: setToken, renew }
}
