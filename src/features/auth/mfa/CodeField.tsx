import type { ChangeEvent } from 'react'
import TextField from '../TextField.tsx'

interface CodeFieldProps {
  id: string
  value: string
  onChange: (value: string) => void
  error?: string
  label?: string
}

/**
 * The 6-digit authenticator code input: a numeric keypad on phones, and
 * `one-time-code` so password managers and phones can fill it.
 */
export default function CodeField({
  id,
  value,
  onChange,
  error,
  label = '6-digit code',
}: CodeFieldProps) {
  return (
    <TextField
      id={id}
      label={label}
      name="code"
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      // Room for the space some apps show in the middle (123 456).
      maxLength={9}
      spellCheck={false}
      value={value}
      onChange={(event: ChangeEvent<HTMLInputElement>) =>
        onChange(event.target.value)
      }
      error={error}
    />
  )
}
