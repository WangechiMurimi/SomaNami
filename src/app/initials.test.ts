import { describe, expect, it } from 'vitest'
import { initialsFor } from './initials.ts'

describe('initialsFor', () => {
  it.each([
    ['jamie.lee@example.com', 'JL'],
    ['jamie_lee@example.com', 'JL'],
    ['jamie@example.com', 'J'],
    ['', '?'],
  ])('%s → %s', (email, initials) => {
    expect(initialsFor(email)).toBe(initials)
  })
})
