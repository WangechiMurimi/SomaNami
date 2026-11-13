import { afterEach, describe, expect, it } from 'vitest'
import {
  MINIMUM_AGE,
  clearAgeBlock,
  isAgeBlocked,
  isOldEnough,
  markAgeBlocked,
} from './age-gate.ts'

const NOV_2026 = new Date(2026, 10, 13)

describe('isOldEnough', () => {
  it('requires 13', () => expect(MINIMUM_AGE).toBe(13))

  it('allows someone who turns 13 this month', () => {
    expect(isOldEnough({ month: 11, year: 2013 }, NOV_2026)).toBe(true)
  })

  it('blocks someone who is 12 years and 11 months', () => {
    expect(isOldEnough({ month: 12, year: 2013 }, NOV_2026)).toBe(false)
  })

  it('allows older learners and blocks younger ones', () => {
    expect(isOldEnough({ month: 1, year: 1990 }, NOV_2026)).toBe(true)
    expect(isOldEnough({ month: 1, year: 2020 }, NOV_2026)).toBe(false)
  })
})

describe('age block flag', () => {
  afterEach(() => clearAgeBlock())

  it('is remembered for the session', () => {
    expect(isAgeBlocked()).toBe(false)
    markAgeBlocked()
    expect(isAgeBlocked()).toBe(true)
    expect(window.sessionStorage.length).toBe(1)
  })

  it('stores no birth date', () => {
    markAgeBlocked()
    const stored = Object.values(window.sessionStorage).join(' ')
    expect(stored).not.toMatch(/\d{4}/)
  })
})
