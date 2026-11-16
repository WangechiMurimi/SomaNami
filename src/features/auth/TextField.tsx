import type { InputHTMLAttributes, ReactNode } from 'react'
import {
  FIELD_ERROR,
  HINT,
  INPUT,
  INPUT_ERROR,
  INPUT_OK,
  LABEL,
} from './auth-ui.ts'

interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'className'
> {
  id: string
  label: string
  hint?: ReactNode
  error?: string
  /** Extra control drawn inside the input's row, e.g. show/hide. */
  trailing?: ReactNode
  /** Link drawn at the end of the label row, e.g. "Forgot your password?". */
  labelAside?: ReactNode
}

/** A labelled input whose hint and error are announced with it. */
export default function TextField({
  id,
  label,
  hint,
  error,
  trailing,
  labelAside,
  ...input
}: TextFieldProps) {
  const describedBy =
    [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') ||
    undefined
  return (
    <div>
      {labelAside ? (
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={id} className={LABEL}>
            {label}
          </label>
          {labelAside}
        </div>
      ) : (
        <label htmlFor={id} className={LABEL}>
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${INPUT} ${error ? INPUT_ERROR : INPUT_OK} ${trailing ? 'pr-20' : ''}`}
          {...input}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-1 mt-2 flex items-center">
            {trailing}
          </div>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className={HINT}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={FIELD_ERROR}>
          {error}
        </p>
      )}
    </div>
  )
}
