import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { FORM_CANCEL, FORM_PRIMARY } from './form-styles.ts'

const FIELD =
  'w-full rounded-[10px] border border-edge bg-surface px-3.5 text-base text-fg'

/** A safe file name from a title, so the pasted text reads like any upload. */
const fileNameFor = (title: string) =>
  `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Pasted text'}.txt`

/**
 * Adds pasted text as a material (US-01 AC3). The text becomes a plain-text
 * file and goes through the same parser as an upload, so it is chunked and
 * cited the same way.
 */
export default function PasteTextForm({
  onFile,
  onCancel,
  disabled = false,
}: {
  onFile: (file: File) => void
  onCancel: () => void
  disabled?: boolean
}) {
  const id = useId()
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim()) {
      setError('Paste some text to add.')
      return
    }
    onFile(new File([text], fileNameFor(title), { type: 'text/plain' }))
    setTitle('')
    setText('')
    setError(null)
  }

  return (
    <form
      onSubmit={submit}
      aria-label="Paste text"
      className="flex flex-col gap-4 rounded-[14px] border border-line p-5"
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-title`} className="text-[15px] font-medium">
          Title <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id={`${id}-title`}
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Seminar notes"
          className={`${FIELD} h-12`}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-text`} className="text-[15px] font-medium">
          Text
        </label>
        <textarea
          id={`${id}-text`}
          rows={6}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            if (error) setError(null)
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${FIELD} resize-y py-3 leading-[1.5]`}
        />
        {error && (
          <p id={`${id}-error`} className="text-sm text-warn">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={disabled} className={FORM_PRIMARY}>
          Add text
        </button>
        <button type="button" onClick={onCancel} className={FORM_CANCEL}>
          Cancel
        </button>
      </div>
    </form>
  )
}
