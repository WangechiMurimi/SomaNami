import { useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import {
  ACCEPT_ATTRIBUTE,
  MAX_FILE_BYTES,
  SUPPORTED_LABEL,
} from './constants.ts'

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
      className={`relative flex cursor-pointer flex-col items-center gap-2.5 rounded-2xl border-[1.5px] border-dashed px-6 py-9 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent hover:border-accent ${
        isOver ? 'border-accent bg-tint' : 'border-edge bg-surface'
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
      <span className="flex size-[52px] items-center justify-center rounded-[14px] bg-tint text-accent">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 13v8" />
          <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
          <path d="m8 17 4-4 4 4" />
        </svg>
      </span>
      <span className="mt-1.5 text-[17px] leading-[1.5] font-medium text-fg">
        Drop notes, readings or slides here
      </span>
      <span className="text-sm leading-[1.5] font-semibold text-accent underline-offset-2 hover:underline">
        or browse your files
      </span>
      <small className="text-[13px] leading-[1.5] text-muted">
        {SUPPORTED_LABEL}, up to {MAX_FILE_BYTES / 1024 / 1024} MB
      </small>
    </label>
  )
}
