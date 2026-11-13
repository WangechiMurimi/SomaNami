/** Youngest age SomaNami accepts (COPPA: no accounts for under-13s). */
export const MINIMUM_AGE = 13

/** What the age screen asks for: month (1–12) and year, never a full date. */
export interface BirthMonth {
  month: number
  year: number
}

/**
 * Whether someone born in `birth` is at least 13 in `now`'s month. We only
 * know the month, so anyone turning 13 this month counts as 13.
 */
export function isOldEnough(
  birth: BirthMonth,
  now: Date = new Date(),
): boolean {
  const months =
    (now.getFullYear() - birth.year) * 12 + (now.getMonth() + 1 - birth.month)
  return months >= MINIMUM_AGE * 12
}

// Only the outcome is kept, never the date, and only for this browser session:
// enough that changing the year and resubmitting doesn't work.
const BLOCK_KEY = 'somanami-age-blocked'

function session(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    // Storage can be disabled (privacy settings); the block then lasts until reload.
    return null
  }
}

let blockedInMemory = false

/** Remembers, for this session, that the visitor was too young to sign up. */
export function markAgeBlocked(): void {
  blockedInMemory = true
  session()?.setItem(BLOCK_KEY, '1')
}

/** Whether sign-up is blocked for this session. */
export function isAgeBlocked(): boolean {
  return blockedInMemory || session()?.getItem(BLOCK_KEY) === '1'
}

/** Test helper: forgets the block. */
export function clearAgeBlock(): void {
  blockedInMemory = false
  session()?.removeItem(BLOCK_KEY)
}
