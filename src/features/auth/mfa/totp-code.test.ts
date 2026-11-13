import { describe, expect, it } from 'vitest'
import { codeError, normaliseCode } from './totp-code.ts'

describe('normaliseCode', () => {
  it.each([
    ['123456', '123456'],
    [' 123 456 ', '123456'],
    ['123-456', '123456'],
    ['１２３４５６', '１２３４５６'],
  ])('turns %j into %j', (raw, expected) => {
    expect(normaliseCode(raw)).toBe(expected)
  })
})

describe('codeError', () => {
  it('accepts six digits, with the spaces apps show', () => {
    expect(codeError('123 456')).toBeUndefined()
  })

  it.each(['', '   '])('asks for a code when given %j', (raw) => {
    expect(codeError(raw)).toBe('Enter the 6-digit code from your app.')
  })

  it.each(['12345', '1234567', '12a456', '１２３４５６'])(
    'rejects %j',
    (raw) => {
      expect(codeError(raw)).toBe('The code is 6 digits, like 123 456.')
    },
  )
})
