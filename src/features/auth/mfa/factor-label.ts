import type { MfaFactor } from '../../../types/auth.ts'

const BASE_NAME = 'Authenticator app'

/** The name to show for a factor; `index` tells unnamed ones apart. */
export function factorLabel(factor: MfaFactor, index: number): string {
  return factor.friendlyName || nameFor(index)
}

/**
 * A name for a new authenticator that no existing one uses or is shown as.
 * Supabase rejects a second factor with the same friendly name, and two
 * rows with the same label couldn't be told apart.
 */
export function nextFactorName(existing: MfaFactor[]): string {
  const taken = new Set(existing.map((f, index) => factorLabel(f, index)))
  for (let index = 0; ; index += 1) {
    const name = nameFor(index)
    if (!taken.has(name)) return name
  }
}

const nameFor = (index: number) =>
  index === 0 ? BASE_NAME : `${BASE_NAME} ${index + 1}`
