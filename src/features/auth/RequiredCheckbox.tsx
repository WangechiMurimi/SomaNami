import type { ReactNode } from 'react'
import { CHECKBOX, CHECKBOX_ROW, FIELD_ERROR } from './auth-ui.ts'

interface RequiredCheckboxProps {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  error?: string
  children: ReactNode
}

/** A required checkbox with its error tied to it for screen readers. */
export default function RequiredCheckbox({
  id,
  checked,
  onChange,
  error,
  children,
}: RequiredCheckboxProps) {
  const errorId = `${id}-error`
  return (
    <div>
      {/* Not wrapping the input: the label holds links, which must stay separate tap targets. */}
      <div className={CHECKBOX_ROW}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={CHECKBOX}
        />
        <label htmlFor={id}>{children}</label>
      </div>
      {error && (
        <p id={errorId} className={FIELD_ERROR}>
          {error}
        </p>
      )}
    </div>
  )
}
