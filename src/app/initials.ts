/** Up to two initials from the email's local part: "jamie.lee@…" → "JL". */
export function initialsFor(email: string): string {
  const local = email.split('@')[0] ?? ''
  const parts = local.split(/[._-]+/).filter(Boolean)
  const [first, second] = parts
  const letters =
    first && second ? `${first[0]}${second[0]}` : local.slice(0, 1)
  return (letters || '?').toUpperCase()
}
