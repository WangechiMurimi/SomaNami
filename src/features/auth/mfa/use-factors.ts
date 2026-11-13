import { useCallback, useEffect, useState } from 'react'
import type { MfaFactor } from '../../../types/auth.ts'
import { useAuth } from '../auth-context.ts'
import { authErrorMessage, toAuthErrorCode } from '../auth-errors.ts'

export type FactorsState =
  | { phase: 'loading'; reload: () => void }
  | { phase: 'error'; message: string; reload: () => void }
  | { phase: 'ready'; factors: MfaFactor[]; reload: () => void }

/** The account's authenticator factors, verified or not, with a way to re-read them. */
export function useFactors(): FactorsState {
  const { mfa } = useAuth()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<
    { factors: MfaFactor[] } | { message: string } | null
  >(null)

  useEffect(() => {
    let active = true
    mfa.listFactors().then(
      (factors) => {
        if (active) setResult({ factors })
      },
      (error: unknown) => {
        if (active) {
          setResult({ message: authErrorMessage(toAuthErrorCode(error)) })
        }
      },
    )
    return () => {
      active = false
    }
  }, [mfa, attempt])

  const reload = useCallback(() => {
    // Keep showing the current list while it refreshes; only an error clears.
    setResult((prev) => (prev && 'message' in prev ? null : prev))
    setAttempt((n) => n + 1)
  }, [])

  if (!result) return { phase: 'loading', reload }
  if ('message' in result) {
    return { phase: 'error', message: result.message, reload }
  }
  return { phase: 'ready', factors: result.factors, reload }
}
