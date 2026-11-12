import { useId, useRef } from 'react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import { ACCEPT_ATTRIBUTE } from '../features/upload/constants.ts'
import { Clipboard, LinkIcon } from './icons.tsx'
import './composer.css'

const TOOL =
  'flex size-11 flex-none items-center justify-center rounded-[10px] text-muted hover:bg-tint hover:text-fg disabled:cursor-not-allowed disabled:opacity-45'

/**
 * The question box from the design: a text area, buttons to add material
 * (upload, link, paste) and Send. Enter sends; Shift+Enter adds a newline.
 */
export default function Composer({
  label,
  placeholder,
  value,
  onChange,
  onSubmit,
  canSend,
  sendDescription,
  onUpload,
  onPaste,
  extra,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  canSend: boolean
  /** Why Send is unavailable, announced with the button. */
  sendDescription?: string
  onUpload?: (file: File | undefined) => void
  onPaste?: () => void
  /** Shown beside the add buttons, e.g. how many materials a chat uses. */
  extra?: ReactNode
}) {
  const id = useId()
  const fileInput = useRef<HTMLInputElement>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (canSend) onSubmit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) submit(event)
  }

  return (
    <form onSubmit={submit} className="composer flex flex-col">
      <label htmlFor={`${id}-question`} className="sr-only">
        {label}
      </label>
      <textarea
        id={`${id}-question`}
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`${placeholder}…`}
        className="min-h-[52px] w-full resize-none bg-transparent px-5 pt-[15px] pb-1 text-[15px] leading-[1.5] text-fg placeholder:text-muted focus:outline-none"
      />
      <div className="flex items-center justify-between gap-3 py-[5px] pr-[5px] pl-2">
        <div className="flex flex-wrap items-center gap-1">
          {onUpload && (
            <>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className={TOOL}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M7 8v8a5 5 0 1 0 10 0V6.5a3.5 3.5 0 1 0-7 0V15a2 2 0 0 0 4 0V8" />
                </svg>
                <span className="sr-only">Upload files</span>
              </button>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                tabIndex={-1}
                aria-hidden="true"
                className="hidden"
                onChange={(event) => {
                  onUpload(event.target.files?.[0])
                  // Clear so choosing the same file again still fires.
                  event.target.value = ''
                }}
              />
            </>
          )}
          <button
            type="button"
            disabled
            aria-describedby={`${id}-link-soon`}
            className={TOOL}
          >
            <LinkIcon size={20} strokeWidth={1.8} />
            <span className="sr-only">Add a link</span>
          </button>
          <span id={`${id}-link-soon`} hidden>
            Links are coming soon.
          </span>
          {onPaste && (
            <button type="button" onClick={onPaste} className={TOOL}>
              <Clipboard size={20} strokeWidth={1.8} />
              <span className="sr-only">Paste text</span>
            </button>
          )}
          {extra}
        </div>
        <button
          type="submit"
          disabled={!canSend}
          aria-describedby={
            !canSend && sendDescription ? `${id}-send-why` : undefined
          }
          className="flex size-11 flex-none items-center justify-center rounded-xl bg-accent text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 12 7-7 7 7" />
            <path d="M12 19V5" />
          </svg>
          <span className="sr-only">Send</span>
        </button>
        {sendDescription && (
          <span id={`${id}-send-why`} hidden>
            {sendDescription}
          </span>
        )}
      </div>
    </form>
  )
}
