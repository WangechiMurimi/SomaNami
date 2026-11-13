import { Link } from 'react-router'
import type { ResolvedCitation } from './describe-source.ts'
import type { ChatTurn } from './use-chat.ts'

const LABEL =
  'flex items-center gap-[7px] text-xs leading-[1.5] font-semibold tracking-[0.06em] uppercase'

function Citations({ citations }: { citations: ResolvedCitation[] }) {
  if (citations.length === 0) {
    // US-06: an answer with no passages behind it is not document-grounded.
    return (
      <p className="border-t border-line pt-3.5 text-[13px] text-muted">
        Written by the assistant, with no passage from your materials behind it.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2.5 border-t border-line pt-3.5">
      <h2 className={`${LABEL} text-accent`}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 7v14" />
          <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
        </svg>
        From your materials
      </h2>
      <ul className="flex flex-col gap-2">
        {citations.map((citation) => (
          <li
            key={citation.key}
            className="flex flex-col gap-1.5 rounded-[10px] bg-tile px-3.5 py-3"
          >
            <span className="text-sm leading-[1.5] font-medium break-words">
              {citation.label}
            </span>
            {citation.text && (
              <q className="text-sm leading-[1.6] text-muted">
                {citation.text}
              </q>
            )}
          </li>
        ))}
      </ul>
    </div>
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
        <p className="max-w-[75%] rounded-[18px] rounded-br-[4px] bg-tint px-[18px] py-3 text-[15px] leading-[1.6] break-words whitespace-pre-wrap">
          <span className="sr-only">You asked: </span>
          {message.content}
        </p>
      </li>
    )
  }

  if (!message.answerable) {
    return (
      <li>
        <article
          aria-label="Not answered from your materials"
          className="flex max-w-[90%] flex-col gap-2.5 rounded-[18px] rounded-bl-[4px] border border-warn bg-warn-soft px-6 py-[18px]"
        >
          <h2 className={`${LABEL} text-warn`}>
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
          <p className="text-[15px] leading-[1.65] break-words whitespace-pre-wrap">
            {message.content}
          </p>
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
        </article>
      </li>
    )
  }

  return (
    <li>
      <article
        aria-label="Answer from your materials"
        className="flex max-w-[90%] flex-col gap-4 rounded-[18px] rounded-bl-[4px] border border-line bg-surface px-6 py-5"
      >
        <p className="text-[15px] leading-[1.65] break-words whitespace-pre-wrap">
          {message.content}
        </p>
        <Citations citations={message.citations} />
      </article>
    </li>
  )
}
