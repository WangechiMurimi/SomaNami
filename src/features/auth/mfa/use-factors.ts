import { useCallback, useEffect, useRef, useState } from 'react'
import type { MfaFactor } from '../../../types/auth.ts'
import { useAuth } from '../auth-context.ts'
import { authErrorMessage, toAuthErrorCode } from '../auth-errors.ts'

type Loaded = { factors: MfaFactor[] } | { message: string }

export type FactorsState = (
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; factors: MfaFactor[] }
) & {
  /** Re-reads the factors; resolves once the new list (or error) is shown. */
  reload: () => Promise<void>
}

/** The account's authenticator factors, verified or not, with a way to re-read them. */
export function useFactors(): FactorsState {
  const { mfa, status } = useAuth()
  // Before the session is restored there is nobody to ask about.
  const known = status !== 'loading'
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  // Only the latest request may land, so a slow early answer can't
  // overwrite a newer list.
  const latest = useRef(0)
  const inFlight = useRef<Promise<void>>(Promise.resolve())

  const fetchFactors = useCallback(
    async (request: number) => {
      let next: Loaded
      try {
        next = { factors: await mfa.listFactors() }
      } catch (error) {
        next = { message: authErrorMessage(toAuthErrorCode(error)) }
      }
      if (request === latest.current) setLoaded(next)
    },
    [mfa],
  )

  const load = useCallback(() => {
    const request = ++latest.current
    const done = fetchFactors(request)
    inFlight.current = done
    return done
  }, [fetchFactors])
  useEffect(() => {
    if (!known) return
    void load()
    return () => {
      latest.current += 1
    }
  }, [known, load])

  const reload = useCallback(async () => {
    // Keep showing the current list while it refreshes; only an error clears.
    setLoaded((prev) => (prev && 'message' in prev ? null : prev))
    // A newer request (say, the effect re-running) may supersede this one;
    // wait for whichever lands last, so callers see the fresh list.
    let current = load()
    await current
    while (inFlight.current !== current) {
      current = inFlight.current
      await current
    }
  }, [load])

  if (!loaded) return { phase: 'loading', reload }
  if ('message' in loaded) {
    return { phase: 'error', message: loaded.message, reload }
  }
  return { phase: 'ready', factors: loaded.factors, reload }
}
