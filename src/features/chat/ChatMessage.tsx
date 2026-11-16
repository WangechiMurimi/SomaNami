import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { AssistantAvatar, Book, FileIcon } from './chat-icons.tsx'
import type { ResolvedCitation } from './describe-source.ts'
import type { ChatTurn } from './use-chat.ts'

const BUBBLE =
  'flex min-w-0 flex-1 flex-col gap-3 rounded-[4px_16px_16px_16px] border px-[18px] py-4'
const BODY = 'text-base leading-[1.6] break-words whitespace-pre-wrap'

/** The source footer: which passages back the answer, each openable in place. */
function Citations({ citations }: { citations: ResolvedCitation[] }) {
  const id = useId()
  const [open, setOpen] = useState<string[]>([])

  if (citations.length === 0) {
    // US-06: an answer with no passages behind it is not document-grounded.
    return (
      <p className="border-t border-line pt-2.5 text-[13px] leading-[1.5] text-muted">
        Written by the assistant, with no passage from your materials behind it.
      </p>
    )
  }

  const toggle = (key: string) =>
    setOpen((current) =>
      current.includes(key)
        ? current.filter((other) => other !== key)
        : [...current, key],
    )

  return (
    <div className="flex flex-col gap-2.5 border-t border-line pt-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-[1.5] text-muted">
        <h2 className="flex items-center gap-1.5 font-semibold text-accent">
          <Book size={14} strokeWidth={1.9} />
          From your materials
        </h2>
        <span aria-hidden="true">·</span>
        <span>
          {citations.length === 1
            ? 'one passage'
            : `${citations.length} passages`}
        </span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {citations.map(({ key, label }, index) => (
          <li key={key} className="min-w-0">
            <button
              type="button"
              aria-expanded={open.includes(key)}
              aria-controls={`${id}-${index}`}
              onClick={() => toggle(key)}
              className={`flex min-h-8 max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-left text-[13px] leading-[1.5] font-medium break-words ${
                open.includes(key)
                  ? 'bg-accent text-on-accent'
                  : 'bg-tint text-accent hover:underline'
              }`}
            >
              <FileIcon size={14} className="flex-none" />
              {label}
            </button>
          </li>
        ))}
      </ul>
      {citations.map(({ key, label, text }, index) =>
        open.includes(key) ? (
          <blockquote
            key={key}
            id={`${id}-${index}`}
            className="flex flex-col gap-1 rounded-[10px] bg-tile px-3.5 py-3"
          >
            <span className="text-[13px] leading-[1.5] font-medium text-muted">
              {label}
            </span>
            <p className="text-sm leading-[1.6] break-words">
              {text ?? 'This passage is no longer in your materials.'}
            </p>
          </blockquote>
        ) : null,
      )}
    </div>
  )
}

/** The avatar and card every assistant turn shares. */
function AssistantTurn({
  label,
  tone,
  children,
}: {
  label: string
  tone: 'answer' | 'warn'
  children: ReactNode
}) {
  return (
    <li>
      <article aria-label={label} className="flex items-start gap-3">
        <AssistantAvatar />
        <div
          className={`${BUBBLE} ${
            tone === 'warn'
              ? 'border-warn bg-warn-soft'
              : 'border-line bg-surface'
          }`}
        >
          {children}
        </div>
      </article>
    </li>
  )
}

/**
 * One transcript turn: the question asked, or the answer with its sources.
 * `addMaterialTo` is where to add material when a question goes unanswered.
 */
export default function ChatMessage({
  message,
  addMaterialTo,
}: {
  message: ChatTurn
  addMaterialTo?: string
}) {
  if (message.role === 'user') {
    return (
      <li className="flex justify-end">
        <p className="max-w-[85%] rounded-[16px_16px_4px_16px] bg-tint px-4 py-3 text-base leading-[1.5] break-words whitespace-pre-wrap sm:max-w-[78%]">
          <span className="sr-only">You asked: </span>
          {message.content}
        </p>
      </li>
    )
  }

  if (!message.answerable) {
    return (
      <AssistantTurn label="Not answered from your materials" tone="warn">
        <h2 className="flex items-center gap-[7px] text-xs leading-[1.5] font-semibold tracking-[0.06em] text-warn uppercase">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6M12 17h.01" />
          </svg>
          Not answered from your materials
        </h2>
        <p className={BODY}>{message.content}</p>
        <p className="text-sm leading-[1.6]">
          Try rephrasing the question
          {addMaterialTo ? (
            <>
              , or{' '}
              <Link
                to={addMaterialTo}
                className="font-semibold text-warn underline"
              >
                add material that covers it
              </Link>
              .
            </>
          ) : (
            ', or add material that covers it.'
          )}
        </p>
      </AssistantTurn>
    )
  }

  return (
    <AssistantTurn label="Answer from your materials" tone="answer">
      <p className={BODY}>{message.content}</p>
      <Citations citations={message.citations} />
    </AssistantTurn>
  )
}
