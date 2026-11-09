import { useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { ACCEPT_ATTRIBUTE, SUPPORTED_LABEL } from './constants.ts'

interface UploadZoneProps {
  onFile: (file: File | undefined) => void
  disabled?: boolean
}

/** Drop target plus file picker; reports the chosen file via `onFile`. */
export default function UploadZone({
  onFile,
  disabled = false,
}: UploadZoneProps) {
  const [isOver, setIsOver] = useState(false)

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setIsOver(false)
    if (!disabled) onFile(event.dataTransfer.files[0])
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onFile(event.target.files?.[0])
    // Clearing lets the same file be re-selected after an error.
    event.target.value = ''
  }

  return (
    <label
      onDragEnter={(e) => {
        e.preventDefault()
        setIsOver(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setIsOver(false)}
      onDrop={handleDrop}
      className={`relative mt-5 flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-jac p-6 text-center transition-colors focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-gold hover:bg-surface ${
        isOver ? 'bg-surface' : 'bg-jac-soft'
      } ${disabled ? 'cursor-progress opacity-70' : ''}`}
    >
      <input
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        aria-label="Upload a document"
        disabled={disabled}
        onChange={handleChange}
        className="sr-only"
      />
      <svg
        width="34"
        height="34"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="text-jac"
      >
        <path d="M12 16V4M7 9l5-5 5 5" />
        <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      </svg>
      <span>
        <b>Drop a document here</b> or{' '}
        <span className="text-jac underline">browse your files</span>
      </span>
      <small className="text-muted">{SUPPORTED_LABEL}, up to 20 MB</small>
    </label>
  )
}
