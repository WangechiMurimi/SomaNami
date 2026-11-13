import { describe, expect, it } from 'vitest'
import { safeNextPath, signInPathFor, verifyPathFor } from './safe-next.ts'

describe('safeNextPath', () => {
  it.each(['/', '/library', '/chat/abc?x=1#top', '/account'])(
    'keeps the same-origin path %s',
    (path) => expect(safeNextPath(path)).toBe(path),
  )

  it.each([
    null,
    '',
    'library',
    '//evil.example',
    '/\\evil.example',
    '/%5Cevil.example',
    '/%2F/evil.example',
    'https://evil.example/',
    'javascript:alert(1)',
    ' /library',
    '/\tlibrary',
    '/sign-in',
    '/sign-in?next=/x',
  ])('falls back to home for %j', (input) => {
    expect(safeNextPath(input)).toBe('/')
  })
})

describe('safeNextPath and the recovery page', () => {
  it('allows returning to /update-password after an MFA code', () => {
    expect(safeNextPath('/update-password')).toBe('/update-password')
  })
})

describe('verifyPathFor', () => {
  it('carries a safe next, and drops home or unsafe ones', () => {
    expect(verifyPathFor('/library')).toBe('/sign-in/verify?next=%2Flibrary')
    expect(verifyPathFor('/')).toBe('/sign-in/verify')
    expect(verifyPathFor('//evil.example')).toBe('/sign-in/verify')
  })
})

describe('signInPathFor', () => {
  it('carries the current location as next', () => {
    expect(signInPathFor('/chat/a b', '?q=1', '')).toBe(
      '/sign-in?next=%2Fchat%2Fa%20b%3Fq%3D1',
    )
  })

  it('skips next for home', () => {
    expect(signInPathFor('/', '', '')).toBe('/sign-in')
  })
})
