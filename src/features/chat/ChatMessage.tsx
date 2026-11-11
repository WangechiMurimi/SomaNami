import type { ResolvedCitation } from './describe-source.ts'
import type { ChatTurn } from './use-chat.ts'

const LABEL_STYLE = 'text-xs font-bold tracking-wide uppercase'

function Citations({ citations }: { citations: ResolvedCitation[] }) {
  if (citations.length === 0) {
    // US-06: an answer with no passages behind it is not document-grounded.
    return (
      <p className="mt-3 border-t border-line pt-2 text-xs text-muted">
        Written by the assistant, with no passage from your documents behind it.
      </p>
    )
  }
  return (
    <div className="mt-3 border-t border-line pt-2">
      <h3 className={`${LABEL_STYLE} text-gold`}>From your documents</h3>
      <ul className="mt-1.5 space-y-1.5">
        {citations.map((citation) => (
          <li key={citation.key} className="border-l-2 border-line pl-3">
            <b className="block text-sm break-words">{citation.label}</b>
            {citation.text && (
              <q className="block text-sm text-muted">{citation.text}</q>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function UnsupportedNotice() {
  return (
    <p className={`flex items-center gap-1.5 text-rose ${LABEL_STYLE}`}>
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
        className="flex-none"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 17h.01" />
      </svg>
      Not answered from your documents
    </p>
  )
}

/** One transcript turn: the question asked, or the answer with its sources. */
export default function ChatMessage({ message }: { message: ChatTurn }) {
  if (message.role === 'user') {
    return (
      <li className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 break-words whitespace-pre-wrap text-paper">
          <span className="sr-only">You asked: </span>
          {message.content}
        </p>
      </li>
    )
  }

  const grounded = message.answerable
  return (
    <li>
      <article
        aria-label={grounded ? 'Answer' : 'Unanswered question'}
        className={`max-w-[90%] rounded-2xl rounded-bl-sm border px-4 py-3 ${
          grounded ? 'border-line bg-surface' : 'border-rose bg-rose-soft'
        }`}
      >
        {!grounded && <UnsupportedNotice />}
        <p
          className={`break-words whitespace-pre-wrap ${grounded ? '' : 'mt-1.5'}`}
        >
          {message.content}
        </p>
        {grounded ? (
          <Citations citations={message.citations} />
        ) : (
          <p className="mt-3 border-t border-rose/40 pt-2 text-sm text-muted">
            Your documents don’t say enough to answer this. Try rewording the
            question, or upload the material that covers it.
          </p>
        )}
      </article>
    </li>
  )
}
