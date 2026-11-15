const SIX_DIGITS = /^[0-9]{6}$/

/** The code as typed, minus the spaces and dashes apps show inside it. */
export function normaliseCode(raw: string): string {
  return raw.replace(/[\s-]/g, '')
}

/** What's wrong with a typed code, or `undefined` when it can be sent. */
export function codeError(raw: string): string | undefined {
  const code = normaliseCode(raw)
  if (!code) return 'Enter the 6-digit code from your app.'
  if (!SIX_DIGITS.test(code)) return 'The code is 6 digits, like 123 456.'
  return undefined
}
