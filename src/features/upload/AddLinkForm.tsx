import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { FORM_CANCEL, FORM_PRIMARY } from './form-styles.ts'
import { normalizeLink } from './fetch-link.ts'

const FIELD =
  'h-12 w-full rounded-[10px] border border-edge bg-surface px-3.5 text-base text-fg'

/**
 * Adds a material from a link (US-01 AC3). The link is fetched by our server
 * and then read by the same parsers as an upload, so it is chunked and cited
 * the same way.
 */
export default function AddLinkForm({
  onLink,
  onCancel,
  disabled = false,
}: {
  onLink: (url: string) => void
  onCancel: () => void
  disabled?: boolean
}) {
  const id = useId()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const url = normalizeLink(value)
    if (!url) {
      setError(
        value.trim()
          ? 'Enter a web address, like https://example.org/article.'
          : 'Paste a link to add.',
      )
      return
    }
    onLink(url)
    setValue('')
    setError(null)
  }

  const describedBy = [`${id}-hint`, error && `${id}-error`]
    .filter(Boolean)
    .join(' ')

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Add a link"
      className="flex flex-col gap-4 rounded-[14px] border border-line p-5"
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-url`} className="text-[0.9375rem] font-medium">
          Link
        </label>
        <input
          id={`${id}-url`}
          type="url"
          inputMode="url"
          autoComplete="url"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            if (error) setError(null)
          }}
          placeholder="https://example.org/article"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={FIELD}
        />
        <p id={`${id}-hint`} className="text-sm text-muted">
          A link to a web article, PDF or Word document. Videos aren’t supported
          yet.
        </p>
        {error && (
          <p id={`${id}-error`} className="text-sm text-warn">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex h-11 items-center rounded-[10px] bg-accent px-[1.125rem] text-sm font-medium text-on-accent disabled:opacity-50"
        >
          Add link
        </button>
        <button type="button" onClick={onCancel} className={FORM_CANCEL}>
          Cancel
        </button>
      </div>
    </form>
  )
}
