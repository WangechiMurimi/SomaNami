import { describe, expect, it } from 'vitest'
import type { MfaFactor } from '../../../types/auth.ts'
import { factorLabel, nextFactorName } from './factor-label.ts'

const named = (friendlyName: string | null): MfaFactor => ({
  id: friendlyName ?? 'x',
  friendlyName,
  status: 'verified',
})

describe('factorLabel', () => {
  it('prefers the friendly name', () => {
    expect(factorLabel(named('Phone'), 3)).toBe('Phone')
  })

  it('numbers unnamed factors', () => {
    expect(factorLabel(named(null), 0)).toBe('Authenticator app')
    expect(factorLabel(named(null), 1)).toBe('Authenticator app 2')
  })
})

describe('nextFactorName', () => {
  it('starts with the plain name', () => {
    expect(nextFactorName([])).toBe('Authenticator app')
    expect(nextFactorName([named('Phone')])).toBe('Authenticator app')
  })

  it('skips names already in use', () => {
    expect(
      nextFactorName([
        named('Authenticator app'),
        named('Authenticator app 3'),
      ]),
    ).toBe('Authenticator app 2')
  })

  it('skips the label an unnamed factor is shown with', () => {
    // The unnamed second factor shows as "Authenticator app 2".
    expect(nextFactorName([named('Authenticator app'), named(null)])).toBe(
      'Authenticator app 3',
    )
  })
})
