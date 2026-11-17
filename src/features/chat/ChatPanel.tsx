import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import Composer from '../../components/Composer.tsx'
import { ANSWER_FORMATS } from './answer-formats.ts'
import { AssistantAvatar, Bulb, ListIcon } from './chat-icons.tsx'
import ChatMessage from './ChatMessage.tsx'
import { useChat } from './use-chat.ts'
import type { UseChatOptions } from './use-chat.ts'

const FORMAT_ICON = { example: Bulb, summary: ListIcon }

function PendingBubble() {
  return (
    <li role="status" className="flex items-center gap-3 text-sm text-muted">
      <AssistantAvatar />
      <span className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="size-2 flex-none animate-pulse rounded-full bg-accent motion-reduce:animate-none"
        />
        Reading your materials…
      </span>
    </li>
  )
}

/** Re-asks for the latest answer in another form (US-05). */
function AnotherFormat({ onPick }: { onPick: (prompt: string) => void }) {
  const id = useId()
  return (
    <div
      role="group"
      aria-labelledby={id}
      className="flex flex-col gap-3 rounded-2xl bg-tile px-[1.125rem] py-4"
    >
      <span id={id} className="text-[0.9375rem] leading-[1.5] font-medium">
        Show another format
      </span>
      <div className="flex flex-wrap gap-2.5">
        {ANSWER_FORMATS.map(({ id, label, prompt }) => {
          const Icon = FORMAT_ICON[id]
          return (
            <button
              key={id}
              type="button"
              onClick={() => onPick(prompt)}
              className="flex h-12 flex-[1_1_120px] items-center justify-center gap-2 rounded-xl border border-edge bg-surface px-3.5 text-[0.9375rem] font-medium hover:border-accent hover:text-accent"
            >
              <Icon size={18} />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Conversation panel: the transcript with its sources, the question box, and
 * the in-flight and failure states around a send.
 */
export default function ChatPanel({
  className = '',
  initialQuestion,
  addMaterialTo,
  ...chatOptions
}: UseChatOptions & {
  className?: string
  initialQuestion?: string
  /** Where to add material when a question goes unanswered. */
  addMaterialTo?: string
}) {
  const { messages, status, error, send, retry } = useChat(chatOptions)
  const askedInitial = useRef(false)

  useEffect(() => {
    // A chat started from Home or New chat arrives with its first question;
    // ask it once, even when React runs effects twice in development.
    if (!initialQuestion || askedInitial.current) return
    askedInitial.current = true
    send(initialQuestion)
  }, [initialQuestion, send])
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const isSending = status === 'sending'
  const canSend = draft.trim().length > 0 && !isSending
  const latest = messages.at(-1)
  // Only a grounded answer has something to reshape; after a refusal or a
  // failure the learner needs to rephrase instead.
  const canReformat =
    latest?.role === 'assistant' && latest.answerable && status === 'idle'

  useLayoutEffect(() => {
    // New turns arrive at the bottom; bring them into view as they land.
    endRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [messages, isSending])

  useEffect(() => {
    // A failure leaves the question in the transcript, so point at the way out.
    if (status === 'error') inputRef.current?.focus()
  }, [status])

  const submit = () => {
    if (!canSend) return
    send(draft)
    setDraft('')
    inputRef.current?.focus()
  }

  return (
    <div className={`flex flex-col gap-6 ${className}`}>
      <section aria-label="Conversation" aria-busy={isSending}>
        {messages.length === 0 && !isSending ? (
          <p className="text-muted">
            Ask a question and the answer will appear here, with the passages it
            came from.
          </p>
        ) : (
          <ol aria-live="polite" className="flex flex-col gap-4">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                addMaterialTo={addMaterialTo}
              />
            ))}
            {isSending && <PendingBubble />}
          </ol>
        )}
        <div ref={endRef} />
      </section>

      {/* TODO(#28): the Level control (and Format, #40) from the chat design
          go here once the server can answer at a level and in a format. */}
      {canReformat && <AnotherFormat onPick={send} />}

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-xl border border-warn bg-warn-soft px-4 py-3"
        >
          <span className="text-sm leading-[1.5]">{error.message}</span>
          {error.retryable && (
            <button
              type="button"
              onClick={retry}
              className="inline-flex h-11 items-center rounded-[10px] border border-warn px-4 text-sm font-semibold text-warn hover:bg-warn/10"
            >
              Try again
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <Composer
          label="Ask a follow-up about your materials"
          placeholder="Ask a follow-up about your materials"
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          canSend={canSend}
          inputRef={inputRef}
        />
        <p className="text-center text-[0.8125rem] leading-[1.5] text-muted">
          This is a simplified overview to get you started. For accuracy and
          depth, always refer to the original source.
        </p>
      </div>
    </div>
  )
}
